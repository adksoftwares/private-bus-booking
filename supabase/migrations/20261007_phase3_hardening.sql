-- ==============================================================================
-- Migration: 20261007_phase3_hardening.sql
-- Description: Phase 3 Concurrency, Deadlock Elimination, Sri Lanka Timezone,
--              and Terminal Webhook State Guard Hardening
--
-- Key Protections:
-- 1. Deadlock-Free Deterministic Seat Sorting:
--    Ensures p_seat_ids are locked in sorted order, mathematically eliminating
--    PostgreSQL 40P01 deadlocks during concurrent multi-seat bookings.
-- 2. Sri Lanka Standard Time (UTC+5:30) Accuracy:
--    In cancel_booking_atomic, parses departure datetime with +05:30 offset
--    to guarantee refund tier accuracy regardless of server UTC time.
-- 3. Webhook Terminal State & Cancellation Defenses:
--    In process_payment_webhook_atomic, gracefully handles webhooks for
--    cancelled bookings without triggering unhandled state machine exceptions.
-- 4. Expired Seat Lock Graceful Recovery on Payment:
--    In confirm_booking_seats_atomic, if lock expired during gateway redirect
--    but seat remains free, allocates seat without failing the customer.
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. DEADLOCK-FREE LOCK SEATS ATOMIC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_seats_atomic(
    p_trip_id TEXT,
    p_seat_ids TEXT[],
    p_user_id TEXT,
    p_booking_id TEXT DEFAULT NULL,
    p_duration_seconds INTEGER DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_seat TEXT;
    v_existing_lock RECORD;
    v_trip RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    v_seat_count INTEGER;
    v_sorted_seats TEXT[];
BEGIN
    v_seat_count := array_length(p_seat_ids, 1);
    IF v_seat_count IS NULL OR v_seat_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_seats_specified', 'message', 'Please select at least one seat.');
    END IF;

    IF v_seat_count > 6 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'max_seats_exceeded', 'maxAllowed', 6, 'message', 'Maximum 6 seats per booking.');
    END IF;

    -- Sort and deduplicate seats to guarantee deterministic deadlock-free locking order
    SELECT ARRAY_AGG(DISTINCT s ORDER BY s) INTO v_sorted_seats FROM UNNEST(p_seat_ids) AS s;
    IF array_length(v_sorted_seats, 1) <> v_seat_count THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate_seats', 'message', 'Duplicate seat IDs in selection.');
    END IF;

    -- Verify trip exists and is scheduled
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_found', 'message', 'Trip not found.');
    END IF;

    IF v_trip.status <> 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_bookable', 'message', 'Trip is not open for reservations.');
    END IF;

    -- Sweep expired locks
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    -- Validate seats in deterministic sorted order
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        SELECT * INTO v_existing_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_lock.status = 'booked' THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'conflicting_seat', v_seat,
                    'reason', 'already_booked',
                    'message', 'Seat ' || v_seat || ' is already booked.'
                );
            END IF;

            IF v_existing_lock.status = 'locked' AND v_existing_lock.user_id <> p_user_id AND v_existing_lock.expires_at > v_now THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'conflicting_seat', v_seat,
                    'reason', 'currently_held',
                    'message', 'Seat ' || v_seat || ' is currently held by another passenger.'
                );
            END IF;
        END IF;
    END LOOP;

    -- Acquire locks atomically in sorted order
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        INSERT INTO public.seat_locks (trip_id, seat_id, user_id, booking_id, status, locked_at, expires_at)
        VALUES (p_trip_id, v_seat, p_user_id, p_booking_id, 'locked', v_now, v_expires_at)
        ON CONFLICT (trip_id, seat_id)
        DO UPDATE SET
            user_id = p_user_id,
            booking_id = p_booking_id,
            status = 'locked',
            locked_at = v_now,
            expires_at = v_expires_at;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'trip_id', p_trip_id,
        'seats', v_sorted_seats,
        'expires_at', v_expires_at,
        'duration_seconds', p_duration_seconds
    );
END;
$$;

-- -------------------------------------------------------------
-- 2. DEADLOCK-FREE CREATE PENDING BOOKING ATOMIC
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pending_booking_atomic(
    p_order_id TEXT,
    p_booking_reference TEXT,
    p_access_token_hash TEXT,
    p_booking_type TEXT,
    p_trip_id TEXT,
    p_user_id TEXT DEFAULT NULL,
    p_passenger_name TEXT DEFAULT NULL,
    p_passenger_phone TEXT DEFAULT NULL,
    p_passenger_email TEXT DEFAULT NULL,
    p_passenger_details JSONB DEFAULT '{}'::jsonb,
    p_seat_ids TEXT[] DEFAULT '{}',
    p_duration_seconds INTEGER DEFAULT 600
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_trip RECORD;
    v_seat TEXT;
    v_seat_count INTEGER;
    v_unit_fare NUMERIC(10,2);
    v_ticket_amount NUMERIC(10,2);
    v_commission NUMERIC(10,2);
    v_gateway_fee NUMERIC(10,2);
    v_owner_net NUMERIC(10,2);
    v_existing_lock RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
    v_user_uuid UUID := NULL;
    v_effective_user_id TEXT;
    v_sorted_seats TEXT[];
BEGIN
    IF p_user_id IS NOT NULL AND p_user_id <> '' AND p_user_id <> 'null' THEN
        BEGIN
            v_user_uuid := p_user_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_user_uuid := NULL;
        END;
    END IF;

    v_seat_count := array_length(p_seat_ids, 1);
    IF v_seat_count IS NULL OR v_seat_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_seats_specified', 'message', 'Please select at least one seat.');
    END IF;

    IF v_seat_count > 6 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'max_seats_exceeded', 'message', 'Maximum 6 seats per booking allowed.');
    END IF;

    -- Sort and deduplicate seats for deterministic deadlock-free locking
    SELECT ARRAY_AGG(DISTINCT s ORDER BY s) INTO v_sorted_seats FROM UNNEST(p_seat_ids) AS s;
    IF array_length(v_sorted_seats, 1) <> v_seat_count THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate_seats', 'message', 'Duplicate seat IDs in selection.');
    END IF;

    -- Lock and validate trip
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_found', 'message', 'Trip schedule not found.');
    END IF;

    IF v_trip.status <> 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_bookable', 'message', 'Trip is not available for reservations.');
    END IF;

    -- Authoritative pricing
    v_unit_fare := COALESCE(v_trip.fare_per_seat, v_trip.base_fare);
    IF v_unit_fare IS NULL OR v_unit_fare <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_fare', 'message', 'Trip fare is invalid.');
    END IF;

    v_ticket_amount := ROUND((v_seat_count * v_unit_fare), 2);
    v_commission := ROUND((v_ticket_amount * 0.10), 2);
    v_gateway_fee := ROUND((v_ticket_amount * 0.03), 2);
    v_owner_net := ROUND((v_ticket_amount - v_commission - v_gateway_fee), 2);

    -- Sweep expired locks
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    v_effective_user_id := COALESCE(v_user_uuid::text, 'gst_' || SUBSTRING(p_access_token_hash, 1, 12));

    -- Verify candidate seats in sorted order
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        SELECT * INTO v_existing_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_lock.status = 'booked' THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'already_booked', 'message', 'Seat ' || v_seat || ' is already booked.');
            END IF;

            IF v_existing_lock.status = 'locked' AND v_existing_lock.booking_id <> p_order_id AND v_existing_lock.expires_at > v_now THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'currently_held', 'message', 'Seat ' || v_seat || ' is currently held by another passenger.');
            END IF;
        END IF;
    END LOOP;

    -- Acquire locks atomically in sorted order
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        INSERT INTO public.seat_locks (trip_id, seat_id, user_id, booking_id, status, locked_at, expires_at)
        VALUES (p_trip_id, v_seat, v_effective_user_id, p_order_id, 'locked', v_now, v_expires_at)
        ON CONFLICT (trip_id, seat_id)
        DO UPDATE SET
            user_id = v_effective_user_id,
            booking_id = p_order_id,
            status = 'locked',
            locked_at = v_now,
            expires_at = v_expires_at;
    END LOOP;

    -- Insert Booking
    INSERT INTO public.bookings (
        id,
        booking_reference,
        access_token,
        access_token_hash,
        booking_type,
        trip_id,
        user_id,
        owner_id,
        passenger_name,
        passenger_phone,
        passenger_email,
        passenger_details,
        seats,
        total_amount,
        fares,
        status,
        boarded,
        trip_snapshot,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        p_booking_reference,
        '',
        p_access_token_hash,
        p_booking_type::booking_type,
        p_trip_id,
        v_user_uuid,
        v_trip.owner_id,
        TRIM(p_passenger_name),
        TRIM(p_passenger_phone),
        NULLIF(TRIM(COALESCE(p_passenger_email, '')), ''),
        p_passenger_details,
        v_sorted_seats,
        v_ticket_amount,
        jsonb_build_object(
            'ticketAmount', v_ticket_amount,
            'platformCommission', v_commission,
            'gatewayFee', v_gateway_fee,
            'ownerNetAmount', v_owner_net
        ),
        'pending',
        FALSE,
        jsonb_build_object(
            'departureDate', v_trip.departure_date,
            'departureTime', v_trip.departure_time,
            'arrivalTime', v_trip.arrival_time,
            'duration', v_trip.duration,
            'routeSnapshot', v_trip.route_snapshot,
            'busSnapshot', v_trip.bus_snapshot,
            'baseFare', v_unit_fare,
            'farePerSeat', v_unit_fare,
            'ownerId', v_trip.owner_id,
            'operatorName', v_trip.operator_name
        ),
        v_now,
        v_now
    );

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES (
        COALESCE(v_user_uuid::text, 'guest'),
        CASE WHEN v_user_uuid IS NOT NULL THEN 'passenger' ELSE 'guest' END,
        'PENDING_BOOKING_CREATED',
        'booking',
        p_order_id,
        jsonb_build_object(
            'seats', v_sorted_seats,
            'amount', v_ticket_amount,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'booking_reference', p_booking_reference,
        'total_amount', v_ticket_amount,
        'seats', v_sorted_seats,
        'expires_at', v_expires_at
    );
END;
$$;

-- -------------------------------------------------------------
-- 3. CONFIRM BOOKING SEATS ATOMIC WITH DEADLOCK PREVENTION
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_booking_seats_atomic(
    p_trip_id TEXT,
    p_seat_ids TEXT[],
    p_booking_id TEXT,
    p_user_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_seat TEXT;
    v_lock RECORD;
    v_sorted_seats TEXT[];
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'booking_not_found', 'message', 'Booking record not found.');
    END IF;

    IF v_booking.trip_id <> p_trip_id THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_mismatch', 'message', 'Trip ID does not match booking.');
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'booking_cancelled', 'message', 'Cannot confirm cancelled booking.');
    END IF;

    -- Sort seats for deterministic lock acquisition
    SELECT ARRAY_AGG(DISTINCT s ORDER BY s) INTO v_sorted_seats FROM UNNEST(p_seat_ids) AS s;

    -- Verify seat availability
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        SELECT * INTO v_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            -- If booked by another booking, conflict!
            IF v_lock.status = 'booked' AND v_lock.booking_id <> p_booking_id THEN
                RETURN jsonb_build_object('success', false, 'reason', 'conflicting_booking', 'seat', v_seat, 'message', 'Seat ' || v_seat || ' is already booked by another passenger.');
            END IF;

            -- If currently actively held by another booking, conflict!
            IF v_lock.status = 'locked' AND v_lock.booking_id <> p_booking_id AND v_lock.expires_at > NOW() THEN
                RETURN jsonb_build_object('success', false, 'reason', 'locked_by_other', 'seat', v_seat, 'message', 'Seat ' || v_seat || ' is held by another passenger.');
            END IF;
        END IF;
    END LOOP;

    -- Transition/claim locks to booked status
    FOREACH v_seat IN ARRAY v_sorted_seats
    LOOP
        INSERT INTO public.seat_locks (trip_id, seat_id, user_id, booking_id, status, locked_at, expires_at)
        VALUES (p_trip_id, v_seat, p_user_id, p_booking_id, 'booked', NOW(), NULL)
        ON CONFLICT (trip_id, seat_id)
        DO UPDATE SET
            status = 'booked',
            booking_id = p_booking_id,
            user_id = p_user_id,
            expires_at = NULL;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Seats confirmed permanently');
END;
$$;

-- -------------------------------------------------------------
-- 4. PROCESS PAYMENT WEBHOOK ATOMIC WITH TERMINAL STATE GUARDS
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_webhook_atomic(
    p_order_id TEXT,
    p_payment_id TEXT,
    p_amount NUMERIC(10,2),
    p_currency TEXT,
    p_status_code TEXT,
    p_raw_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_effective_payment_id TEXT;
    v_seat_confirm_res JSONB;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'booking_not_found');
    END IF;

    -- Idempotency check: Already confirmed
    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_confirmed', 'message', 'Booking already confirmed previously');
    END IF;

    -- Terminal state guard: Already cancelled
    IF v_booking.status = 'cancelled' THEN
        INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES (
            'payhere_webhook',
            'system',
            'PAYMENT_RECEIVED_FOR_CANCELLED_BOOKING',
            'booking',
            p_order_id,
            jsonb_build_object('paid_amount', p_amount, 'payment_id', p_payment_id, 'status_code', p_status_code)
        );
        RETURN jsonb_build_object('success', false, 'reason', 'already_cancelled', 'message', 'Booking has already been cancelled. Payment noted for manual refund processing.');
    END IF;

    -- Terminal state guard: Already boarded
    IF v_booking.status = 'boarded' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_boarded', 'message', 'Booking already boarded');
    END IF;

    -- Currency check
    IF p_currency <> 'LKR' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'currency_mismatch', 'expected', 'LKR', 'received', p_currency);
    END IF;

    -- Amount check
    IF ABS(v_booking.total_amount - p_amount) >= 0.01 THEN
        INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES (
            'payhere_webhook',
            'system',
            'PAYMENT_AMOUNT_MISMATCH',
            'booking',
            p_order_id,
            jsonb_build_object('expected_amount', v_booking.total_amount, 'paid_amount', p_amount, 'payment_id', p_payment_id)
        );
        RETURN jsonb_build_object('success', false, 'reason', 'amount_mismatch', 'expected', v_booking.total_amount, 'received', p_amount);
    END IF;

    v_effective_payment_id := COALESCE(NULLIF(p_payment_id, ''), 'PAY-' || p_order_id);

    -- Status code 2 = Success
    IF p_status_code = '2' THEN
        IF v_booking.seats IS NOT NULL AND array_length(v_booking.seats, 1) > 0 THEN
            v_seat_confirm_res := public.confirm_booking_seats_atomic(
                v_booking.trip_id,
                v_booking.seats,
                p_order_id,
                COALESCE(v_booking.user_id::text, 'guest')
            );

            IF NOT (v_seat_confirm_res->>'success')::BOOLEAN THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'reason', 'seat_confirmation_failed',
                    'details', v_seat_confirm_res
                );
            END IF;
        END IF;

        UPDATE public.bookings
        SET status = 'confirmed',
            payment_id = v_effective_payment_id,
            updated_at = NOW()
        WHERE id = p_order_id;

        INSERT INTO public.payments (id, booking_id, order_id, amount, currency, status, provider, raw_payload, created_at, updated_at)
        VALUES (v_effective_payment_id, p_order_id, p_order_id, p_amount, p_currency, 'completed', 'payhere', p_raw_payload, NOW(), NOW())
        ON CONFLICT (order_id)
        DO UPDATE SET
            status = 'completed',
            amount = p_amount,
            currency = p_currency,
            updated_at = NOW(),
            raw_payload = p_raw_payload;

        INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES (
            'payhere_webhook',
            'system',
            'PAYMENT_CONFIRMED',
            'booking',
            p_order_id,
            jsonb_build_object('amount', p_amount, 'payment_id', v_effective_payment_id)
        );

        RETURN jsonb_build_object('success', true, 'status', 'confirmed', 'message', 'Payment confirmed and seats allocated permanently');
    ELSE
        -- Payment failed or cancelled
        IF v_booking.status = 'pending' THEN
            UPDATE public.bookings
            SET status = 'payment_failed',
                updated_at = NOW()
            WHERE id = p_order_id;
        END IF;

        INSERT INTO public.payments (id, booking_id, order_id, amount, currency, status, provider, raw_payload, created_at, updated_at)
        VALUES (v_effective_payment_id, p_order_id, p_order_id, p_amount, p_currency, 'failed', 'payhere', p_raw_payload, NOW(), NOW())
        ON CONFLICT (order_id)
        DO UPDATE SET
            status = 'failed',
            updated_at = NOW(),
            raw_payload = p_raw_payload;

        DELETE FROM public.seat_locks
        WHERE trip_id = v_booking.trip_id
          AND booking_id = p_order_id
          AND status = 'locked';

        INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES (
            'payhere_webhook',
            'system',
            'PAYMENT_FAILED',
            'booking',
            p_order_id,
            jsonb_build_object('status_code', p_status_code, 'amount', p_amount)
        );

        RETURN jsonb_build_object('success', false, 'status', 'payment_failed', 'message', 'Payment failed or cancelled');
    END IF;
END;
$$;

-- -------------------------------------------------------------
-- 5. CANCEL BOOKING ATOMIC WITH SRI LANKA TIMEZONE ACCURACY
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_booking_id TEXT,
    p_caller_id TEXT,
    p_access_token_hash TEXT,
    p_is_admin BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_departure_date TEXT;
    v_departure_time TEXT;
    v_departure_dt TIMESTAMPTZ;
    v_diff_hours NUMERIC;
    v_refund_percentage INTEGER := 0;
    v_original_amount NUMERIC(10,2);
    v_refund_amount NUMERIC(10,2);
    v_refund_id TEXT;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Booking not found');
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_cancelled', 'message', 'This booking has already been cancelled.');
    END IF;

    IF v_booking.status = 'boarded' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_boarded', 'message', 'Cannot cancel a journey after passenger has boarded.');
    END IF;

    -- Strict Authorization Check
    IF p_is_admin = TRUE THEN
        v_is_authorized := TRUE;
    ELSIF v_booking.user_id IS NOT NULL AND p_caller_id IS NOT NULL AND v_booking.user_id::text = p_caller_id THEN
        v_is_authorized := TRUE;
    ELSIF p_access_token_hash IS NOT NULL AND (
        (v_booking.access_token_hash IS NOT NULL AND v_booking.access_token_hash = p_access_token_hash) OR
        (v_booking.access_token_hash IS NOT NULL AND v_booking.access_token_hash = encode(digest(p_access_token_hash, 'sha256'), 'hex')) OR
        (v_booking.access_token IS NOT NULL AND v_booking.access_token = p_access_token_hash)
    ) THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'unauthorized',
            'message', 'Unauthorized: You are not authorized to cancel this booking.'
        );
    END IF;

    -- Sri Lanka Standard Time (UTC+5:30) Accuracy
    v_departure_date := v_booking.trip_snapshot->>'departureDate';
    v_departure_time := v_booking.trip_snapshot->>'departureTime';

    IF v_departure_date IS NOT NULL AND v_departure_time IS NOT NULL THEN
        BEGIN
            -- Explicit +05:30 time zone offset ensures accurate calculation against Asia/Colombo
            v_departure_dt := (v_departure_date || ' ' || v_departure_time || '+05:30')::TIMESTAMPTZ;
            v_diff_hours := EXTRACT(EPOCH FROM (v_departure_dt - NOW())) / 3600.0;

            IF v_diff_hours > 24.0 THEN
                v_refund_percentage := 100;
            ELSIF v_diff_hours >= 12.0 THEN
                v_refund_percentage := 50;
            ELSE
                v_refund_percentage := 0;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_refund_percentage := 0;
        END;
    END IF;

    v_original_amount := v_booking.total_amount;
    v_refund_amount := ROUND(((v_original_amount * v_refund_percentage) / 100.0), 2);
    v_refund_id := 'RF-' || gen_random_uuid();

    -- Update Booking
    UPDATE public.bookings
    SET status = 'cancelled',
        refund_id = v_refund_id,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Insert Refund
    INSERT INTO public.refunds (id, booking_id, user_id, original_amount, refund_amount, refund_percentage, status, created_at)
    VALUES (
        v_refund_id,
        p_booking_id,
        v_booking.user_id,
        v_original_amount,
        v_refund_amount,
        v_refund_percentage,
        CASE WHEN v_refund_amount > 0 THEN 'pending' ELSE 'completed' END,
        NOW()
    );

    -- Free seat locks
    DELETE FROM public.seat_locks
    WHERE trip_id = v_booking.trip_id
      AND booking_id = p_booking_id;

    -- Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES (
        COALESCE(p_caller_id, 'guest'),
        CASE WHEN p_is_admin THEN 'admin' WHEN p_caller_id IS NOT NULL THEN 'passenger' ELSE 'guest' END,
        'BOOKING_CANCELLED',
        'booking',
        p_booking_id,
        jsonb_build_object(
            'refund_percentage', v_refund_percentage,
            'refund_amount', v_refund_amount,
            'hours_before_departure', v_diff_hours,
            'refund_id', v_refund_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'cancelled',
        'refund_percentage', v_refund_percentage,
        'refund_amount', v_refund_amount,
        'refund_id', v_refund_id,
        'message', 'Booking successfully cancelled'
    );
END;
$$;

-- Ensure execute permissions
GRANT EXECUTE ON FUNCTION public.lock_seats_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_booking_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_seats_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic TO service_role;
