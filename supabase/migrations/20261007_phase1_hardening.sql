-- ==============================================================================
-- SRI LANKAN PRIVATE BUS BOOKING SYSTEM — PHASE 1 PRODUCTION HARDENING MIGRATION
-- Authoritative Schema Constraints, Booking State Machine, ACID Transactions,
-- Least-Privilege RLS, Column-Level Security, & Cryptographic Integrity
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. SCHEMA EVOLUTION & NEW COLUMNS
-- ==============================================================================

-- Add access_token_hash for cryptographic guest token verification
DO $$ BEGIN
    ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;

-- Populate access_token_hash for existing bookings if empty
UPDATE public.bookings
SET access_token_hash = encode(digest(access_token, 'sha256'), 'hex')
WHERE access_token IS NOT NULL AND access_token <> '' AND access_token_hash IS NULL;

-- Allow access_token to be nullable and defaulted, so raw plaintext tokens are never stored
ALTER TABLE public.bookings ALTER COLUMN access_token DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN access_token SET DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_bookings_access_token_hash ON public.bookings(access_token_hash);

-- 3. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. HARDENED CONSTRAINTS & INTEGRITY CHECKS
-- ==============================================================================

DO $$ BEGIN
    ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS chk_trips_positive_fare;
    ALTER TABLE public.trips ADD CONSTRAINT chk_trips_positive_fare CHECK (base_fare > 0 AND fare_per_seat > 0);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS chk_bookings_positive_amount;
    ALTER TABLE public.bookings ADD CONSTRAINT chk_bookings_positive_amount CHECK (total_amount > 0);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.buses DROP CONSTRAINT IF EXISTS chk_buses_seat_bounds;
    ALTER TABLE public.buses ADD CONSTRAINT chk_buses_seat_bounds CHECK (total_seats >= 10 AND total_seats <= 75);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.bus_reviews DROP CONSTRAINT IF EXISTS chk_reviews_rating_range;
    ALTER TABLE public.bus_reviews ADD CONSTRAINT chk_reviews_rating_range CHECK (rating >= 1 AND rating <= 5);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS uq_payments_order;
    ALTER TABLE public.payments ADD CONSTRAINT uq_payments_order UNIQUE (order_id);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS chk_payments_positive_amount;
    ALTER TABLE public.payments ADD CONSTRAINT chk_payments_positive_amount CHECK (amount > 0);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.refunds DROP CONSTRAINT IF EXISTS chk_refunds_bounds;
    ALTER TABLE public.refunds ADD CONSTRAINT chk_refunds_bounds CHECK (refund_amount >= 0 AND refund_percentage >= 0 AND refund_percentage <= 100);
EXCEPTION
    WHEN duplicate_object OR duplicate_table THEN null;
END $$;

-- ==============================================================================
-- 5. COMPREHENSIVE PERFORMANCE & ISOLATION INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON public.bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_owner ON public.bookings(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON public.bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_status_trip ON public.bookings(status, trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_token_hash ON public.bookings(access_token_hash);

CREATE INDEX IF NOT EXISTS idx_seat_locks_trip ON public.seat_locks(trip_id);
CREATE INDEX IF NOT EXISTS idx_seat_locks_trip_seat ON public.seat_locks(trip_id, seat_id);
CREATE INDEX IF NOT EXISTS idx_seat_locks_booking ON public.seat_locks(booking_id);
CREATE INDEX IF NOT EXISTS idx_seat_locks_status_expires ON public.seat_locks(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id);

CREATE INDEX IF NOT EXISTS idx_refunds_booking ON public.refunds(booking_id);

CREATE INDEX IF NOT EXISTS idx_trips_owner ON public.trips(owner_id);
CREATE INDEX IF NOT EXISTS idx_trips_search ON public.trips(departure_date, status);

CREATE INDEX IF NOT EXISTS idx_staff_trip_assignments_trip ON public.staff_trip_assignments(trip_id);
CREATE INDEX IF NOT EXISTS idx_staff_trip_assignments_staff ON public.staff_trip_assignments(staff_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- ==============================================================================
-- 6. STRICT BOOKING STATE MACHINE TRIGGER
-- Enforces valid lifecycle transitions at the PostgreSQL engine level
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_booking_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Unchanged status is always allowed
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Valid transitions:
    -- pending -> confirmed, payment_failed, cancelled
    -- confirmed -> boarded, cancelled
    -- Terminal states: payment_failed, cancelled, boarded
    IF OLD.status = 'pending' AND NEW.status IN ('confirmed', 'payment_failed', 'cancelled') THEN
        RETURN NEW;
    ELSIF OLD.status = 'confirmed' AND NEW.status IN ('boarded', 'cancelled') THEN
        RETURN NEW;
    ELSE
        RAISE EXCEPTION 'Illegal booking status transition from "%" to "%"', OLD.status, NEW.status
            USING ERRCODE = '23514'; -- check_violation
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_state_transition ON public.bookings;
CREATE TRIGGER trg_booking_state_transition
    BEFORE UPDATE OF status ON public.bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.check_booking_state_transition();

-- ==============================================================================
-- 7. AUTHORITATIVE ATOMIC POSTGRESQL TRANSACTIONS (RPCS)
-- All functions explicitly enforce: SET search_path = public, pg_temp;
-- ==============================================================================

-- 7.1. Atomic Multi-Seat Locking Function (ACID, Anti-Double Booking, All-or-Nothing)
CREATE OR REPLACE FUNCTION public.lock_seats_atomic(
    p_trip_id TEXT,
    p_seat_ids TEXT[],
    p_user_id TEXT,
    p_booking_id TEXT,
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
    v_distinct_seats TEXT[];
BEGIN
    -- 1. Check seat count bounds
    v_seat_count := array_length(p_seat_ids, 1);
    IF v_seat_count IS NULL OR v_seat_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_seats_specified', 'message', 'Please select at least one seat.');
    END IF;

    IF v_seat_count > 6 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'max_seats_exceeded', 'maxAllowed', 6, 'message', 'Maximum 6 seats per booking.');
    END IF;

    -- 2. Reject duplicate seat IDs in input array
    SELECT ARRAY_AGG(DISTINCT s) INTO v_distinct_seats FROM UNNEST(p_seat_ids) AS s;
    IF array_length(v_distinct_seats, 1) <> v_seat_count THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate_seats', 'message', 'Duplicate seat IDs in selection.');
    END IF;

    -- 3. Verify trip exists, is scheduled, and departure is in the future
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_found', 'message', 'Trip not found.');
    END IF;

    IF v_trip.status <> 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_bookable', 'message', 'Trip is not open for reservations.');
    END IF;

    -- 4. Sweep expired locks for this trip first
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    -- 5. Validate each requested seat atomically with row-level locks
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        SELECT * INTO v_existing_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            -- Permanent confirmed booking conflict
            IF v_existing_lock.status = 'booked' THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'already_booked', 'message', 'Seat ' || v_seat || ' is already booked.');
            END IF;

            -- Active lock held by a DIFFERENT user/session
            IF v_existing_lock.status = 'locked' AND v_existing_lock.user_id <> p_user_id AND v_existing_lock.expires_at > v_now THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'currently_held', 'message', 'Seat ' || v_seat || ' is held by another passenger.');
            END IF;
        END IF;
    END LOOP;

    -- 6. All requested seats are free -> Acquire/renew locks atomically (All-or-Nothing)
    FOREACH v_seat IN ARRAY p_seat_ids
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

    RETURN jsonb_build_object('success', true, 'expires_at', v_expires_at);
END;
$$;

-- 7.2. Atomic Booking Creation Function (One Single ACID Transaction)
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
    v_distinct_seats TEXT[];
BEGIN
    -- Safely parse UUID if provided
    IF p_user_id IS NOT NULL AND p_user_id <> '' AND p_user_id <> 'null' THEN
        BEGIN
            v_user_uuid := p_user_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_user_uuid := NULL;
        END;
    END IF;

    -- 1. Validate seat count bounds (1 to 6)
    v_seat_count := array_length(p_seat_ids, 1);
    IF v_seat_count IS NULL OR v_seat_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_seats_specified', 'message', 'Please select at least one seat.');
    END IF;

    IF v_seat_count > 6 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'max_seats_exceeded', 'message', 'Maximum 6 seats per booking allowed.');
    END IF;

    -- 2. Reject duplicate seat IDs in array
    SELECT ARRAY_AGG(DISTINCT s) INTO v_distinct_seats FROM UNNEST(p_seat_ids) AS s;
    IF array_length(v_distinct_seats, 1) <> v_seat_count THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate_seats', 'message', 'Duplicate seat IDs in selection.');
    END IF;

    -- 3. Lock and validate trip authoritatively
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id FOR SHARE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_found', 'message', 'Trip schedule not found.');
    END IF;

    IF v_trip.status <> 'scheduled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_bookable', 'message', 'Trip is not available for reservations.');
    END IF;

    -- 4. Calculate authoritative pricing (database as sole authority)
    v_unit_fare := COALESCE(v_trip.fare_per_seat, v_trip.base_fare);
    IF v_unit_fare IS NULL OR v_unit_fare <= 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'invalid_fare', 'message', 'Trip fare is invalid.');
    END IF;

    v_ticket_amount := ROUND((v_seat_count * v_unit_fare), 2);
    v_commission := ROUND((v_ticket_amount * 0.10), 2);
    v_gateway_fee := ROUND((v_ticket_amount * 0.03), 2);
    v_owner_net := ROUND((v_ticket_amount - v_commission - v_gateway_fee), 2);

    -- 5. Sweep expired locks for this trip
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    v_effective_user_id := COALESCE(v_user_uuid::text, 'gst_' || SUBSTRING(p_access_token_hash, 1, 12));

    -- 6. Atomically verify candidate seats are completely free
    FOREACH v_seat IN ARRAY p_seat_ids
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

    -- 7. All seats free -> Acquire seat locks atomically (All-or-Nothing)
    FOREACH v_seat IN ARRAY p_seat_ids
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

    -- 8. Insert Booking Record
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
        p_seat_ids,
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

    -- 9. Insert Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES (
        COALESCE(v_user_uuid::text, 'guest'),
        CASE WHEN v_user_uuid IS NOT NULL THEN 'passenger' ELSE 'guest' END,
        'BOOKING_CREATED',
        'booking',
        p_order_id,
        jsonb_build_object(
            'trip_id', p_trip_id,
            'seats', p_seat_ids,
            'total_amount', v_ticket_amount,
            'booking_type', p_booking_type
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'booking_reference', p_booking_reference,
        'total_amount', v_ticket_amount,
        'fares', jsonb_build_object(
            'ticketAmount', v_ticket_amount,
            'platformCommission', v_commission,
            'gatewayFee', v_gateway_fee,
            'ownerNetAmount', v_owner_net
        ),
        'expires_at', v_expires_at
    );
END;
$$;

-- 7.3. Atomic Booking Seat Confirmation (No Generic Upsert, No Overwriting Other Bookings)
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
BEGIN
    -- 1. Verify booking exists and matches trip
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

    -- 2. Verify EVERY seat lock strictly belongs to this booking
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        SELECT * INTO v_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'reason', 'seat_not_locked', 'seat', v_seat, 'message', 'Seat lock missing for seat ' || v_seat);
        END IF;

        -- If booked by another booking, fail immediately
        IF v_lock.status = 'booked' AND v_lock.booking_id <> p_booking_id THEN
            RETURN jsonb_build_object('success', false, 'reason', 'conflicting_booking', 'seat', v_seat, 'message', 'Seat ' || v_seat || ' is booked by another passenger.');
        END IF;

        -- If locked by another booking, fail immediately
        IF v_lock.status = 'locked' AND v_lock.booking_id <> p_booking_id THEN
            RETURN jsonb_build_object('success', false, 'reason', 'locked_by_other', 'seat', v_seat, 'message', 'Seat ' || v_seat || ' is locked by another booking.');
        END IF;
    END LOOP;

    -- 3. Transition ONLY verified locks from locked -> booked (No generic upsert!)
    UPDATE public.seat_locks
    SET status = 'booked',
        expires_at = NULL,
        user_id = COALESCE(p_user_id, user_id)
    WHERE trip_id = p_trip_id
      AND seat_id = ANY(p_seat_ids)
      AND booking_id = p_booking_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 7.4. Atomic Payment Webhook Processing (PayHere IPN Single Transaction)
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
    v_seat TEXT;
    v_effective_payment_id TEXT;
    v_seat_confirm_res JSONB;
BEGIN
    -- 1. Lock booking row FOR UPDATE
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'booking_not_found');
    END IF;

    -- 2. Idempotency check: If already confirmed, return clean idempotent success
    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_confirmed', 'message', 'Booking already confirmed previously');
    END IF;

    -- 3. Currency check: Sri Lankan Rupee only
    IF p_currency <> 'LKR' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'currency_mismatch', 'expected', 'LKR', 'received', p_currency);
    END IF;

    -- 4. Authoritative Amount Validation: Match booking total within 0.01 tolerance
    IF ABS(v_booking.total_amount - p_amount) >= 0.01 THEN
        INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
        VALUES (
            'payhere_webhook',
            'system',
            'PAYMENT_AMOUNT_MISMATCH',
            'booking',
            p_order_id,
            jsonb_build_object(
                'expected_amount', v_booking.total_amount,
                'paid_amount', p_amount,
                'payment_id', p_payment_id
            )
        );
        RETURN jsonb_build_object('success', false, 'reason', 'amount_mismatch', 'expected', v_booking.total_amount, 'received', p_amount);
    END IF;

    v_effective_payment_id := COALESCE(NULLIF(p_payment_id, ''), 'PAY-' || p_order_id);

    -- 5. PayHere status_code '2' = SUCCESS
    IF p_status_code = '2' THEN
        -- A. Confirm seats using authoritative non-overwriting function
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

        -- B. Update booking state (enforced by state machine trigger)
        UPDATE public.bookings
        SET status = 'confirmed',
            payment_id = v_effective_payment_id,
            updated_at = NOW()
        WHERE id = p_order_id;

        -- C. Upsert payment record
        INSERT INTO public.payments (id, booking_id, order_id, amount, currency, status, provider, raw_payload, created_at, updated_at)
        VALUES (v_effective_payment_id, p_order_id, p_order_id, p_amount, p_currency, 'completed', 'payhere', p_raw_payload, NOW(), NOW())
        ON CONFLICT (order_id)
        DO UPDATE SET
            status = 'completed',
            amount = p_amount,
            currency = p_currency,
            updated_at = NOW(),
            raw_payload = p_raw_payload;

        -- D. Audit log entry
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
        -- Payment failed or cancelled by gateway
        UPDATE public.bookings
        SET status = 'payment_failed',
            updated_at = NOW()
        WHERE id = p_order_id;

        -- Record failed payment
        INSERT INTO public.payments (id, booking_id, order_id, amount, currency, status, provider, raw_payload, created_at, updated_at)
        VALUES (v_effective_payment_id, p_order_id, p_order_id, p_amount, p_currency, 'failed', 'payhere', p_raw_payload, NOW(), NOW())
        ON CONFLICT (order_id)
        DO UPDATE SET
            status = 'failed',
            updated_at = NOW(),
            raw_payload = p_raw_payload;

        -- Free temporary seat locks held by this pending booking
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

-- 7.5. Atomic Passenger Boarding Check-In (Strict Staff Assignment & Single-Use Enforcement)
CREATE OR REPLACE FUNCTION public.board_passenger_atomic(
    p_booking_id TEXT,
    p_conductor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_booking RECORD;
    v_profile RECORD;
    v_assignment RECORD;
    v_is_authorized BOOLEAN := FALSE;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Booking not found');
    END IF;

    -- Conductor Trip Assignment Verification
    IF p_conductor_id IS NOT NULL AND p_conductor_id <> '' THEN
        -- Check if conductor is the bus owner
        IF v_booking.owner_id::text = p_conductor_id THEN
            v_is_authorized := TRUE;
        ELSE
            -- Check user profile role
            SELECT * INTO v_profile FROM public.profiles WHERE id::text = p_conductor_id;
            IF FOUND AND v_profile.role = 'Admin' THEN
                v_is_authorized := TRUE;
            ELSE
                -- Check staff_trip_assignments for this specific trip
                SELECT * INTO v_assignment
                FROM public.staff_trip_assignments
                WHERE trip_id = v_booking.trip_id AND staff_id::text = p_conductor_id;

                IF FOUND THEN
                    v_is_authorized := TRUE;
                END IF;
            END IF;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'unauthorized_staff',
            'message', 'Staff member is not assigned to this trip schedule.'
        );
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'cancelled', 'message', 'Ticket was cancelled and refunded.');
    END IF;

    IF v_booking.status <> 'confirmed' AND v_booking.status <> 'boarded' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unconfirmed', 'message', 'Ticket is unpaid or pending confirmation.');
    END IF;

    -- Anti-double scan check
    IF v_booking.boarded = TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'already_boarded',
            'message', 'Passenger has already boarded this bus.',
            'boarded_at', v_booking.boarded_at,
            'boarded_by', v_booking.boarded_by
        );
    END IF;

    -- Mark boarded atomically (state machine permits confirmed -> boarded)
    UPDATE public.bookings
    SET boarded = TRUE,
        boarded_at = NOW(),
        boarded_by = p_conductor_id,
        status = 'boarded',
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- Audit log
    INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES (
        p_conductor_id,
        'conductor',
        'PASSENGER_BOARDED',
        'booking',
        p_booking_id,
        jsonb_build_object('trip_id', v_booking.trip_id, 'seats', v_booking.seats)
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Passenger successfully boarded',
        'boarded_at', NOW()
    );
END;
$$;

-- 7.6. Atomic Booking Cancellation & Refund Stored Procedure
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

    -- Strict Authorization Check: Admin OR matching Account OR matching Access Token Hash
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

    -- Authoritative Refund Calculation
    v_departure_date := v_booking.trip_snapshot->>'departureDate';
    v_departure_time := v_booking.trip_snapshot->>'departureTime';

    IF v_departure_date IS NOT NULL AND v_departure_time IS NOT NULL THEN
        BEGIN
            v_departure_dt := (v_departure_date || ' ' || v_departure_time)::TIMESTAMPTZ;
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

    -- 1. Update Booking state
    UPDATE public.bookings
    SET status = 'cancelled',
        refund_id = v_refund_id,
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_booking_id;

    -- 2. Insert Refund Record
    INSERT INTO public.refunds (id, booking_id, user_id, original_amount, refund_amount, refund_percentage, status, created_at)
    VALUES (
        v_refund_id,
        p_booking_id,
        COALESCE(p_caller_id, v_booking.user_id::text, 'guest'),
        v_original_amount,
        v_refund_amount,
        v_refund_percentage,
        CASE WHEN v_refund_amount > 0 THEN 'pending_payout' ELSE 'no_refund' END,
        NOW()
    );

    -- 3. Release ONLY this booking's seats atomically
    DELETE FROM public.seat_locks
    WHERE trip_id = v_booking.trip_id
      AND booking_id = p_booking_id;

    -- 4. Audit Log
    INSERT INTO public.audit_logs (actor_id, actor_role, action, resource_type, resource_id, metadata)
    VALUES (
        COALESCE(p_caller_id, 'guest'),
        CASE WHEN p_is_admin THEN 'admin' ELSE 'passenger' END,
        'BOOKING_CANCELLED',
        'booking',
        p_booking_id,
        jsonb_build_object(
            'refund_id', v_refund_id,
            'refund_amount', v_refund_amount,
            'refund_percentage', v_refund_percentage
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'refund_percentage', v_refund_percentage,
        'refund_amount', v_refund_amount,
        'refund_id', v_refund_id,
        'message', CASE
            WHEN v_refund_amount > 0 THEN 'Booking cancelled successfully. Eligible for refund.'
            ELSE 'Booking cancelled. No refund available within 12 hours of departure.'
        END
    );
END;
$$;

-- 7.7. Atomic Single-Seat Release Function
CREATE OR REPLACE FUNCTION public.unlock_seat_atomic(
    p_trip_id TEXT,
    p_seat_id TEXT,
    p_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND seat_id = p_seat_id
      AND status = 'locked'
      AND (user_id = p_user_id OR p_user_id = 'admin');

    RETURN FOUND;
END;
$$;

-- 7.8. Safe Trip Seat Availability Query (Strictly Masks All Ownership Data)
CREATE OR REPLACE FUNCTION public.get_trip_seat_availability(
    p_trip_id TEXT,
    p_caller_user_id TEXT DEFAULT NULL
)
RETURNS TABLE (
    seat_id TEXT,
    status TEXT,
    is_mine BOOLEAN,
    expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Clean up expired locks first
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < NOW();

    -- Return safe masked view: NEVER expose user_id or booking_id!
    RETURN QUERY
    SELECT
        sl.seat_id,
        sl.status::TEXT,
        CASE
            WHEN p_caller_user_id IS NOT NULL AND sl.user_id = p_caller_user_id THEN TRUE
            ELSE FALSE
        END AS is_mine,
        sl.expires_at
    FROM public.seat_locks sl
    WHERE sl.trip_id = p_trip_id;
END;
$$;

-- ==============================================================================
-- 8. SECURITY HARDENING: RPC EXECUTE PERMISSIONS
-- ==============================================================================

-- Revoke all execute by default on sensitive RPCs
REVOKE ALL ON FUNCTION public.create_pending_booking_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_booking_seats_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_payment_webhook_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_booking_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.board_passenger_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_seat_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_seats_atomic FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_trip_seat_availability FROM PUBLIC, anon, authenticated;

-- Grant to trusted server role only
GRANT EXECUTE ON FUNCTION public.create_pending_booking_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_seats_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.board_passenger_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_seat_atomic TO service_role;
GRANT EXECUTE ON FUNCTION public.lock_seats_atomic TO service_role;

-- Safe public availability function
GRANT EXECUTE ON FUNCTION public.get_trip_seat_availability TO anon, authenticated, service_role;

-- ==============================================================================
-- 9. LEAST-PRIVILEGE ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS across all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bus_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_trip_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Seat Locks: Restrict direct select of sensitive columns from anon/authenticated
REVOKE SELECT ON public.seat_locks FROM anon, authenticated;
GRANT SELECT (id, trip_id, seat_id, status, locked_at, expires_at) ON public.seat_locks TO anon, authenticated;

-- Bookings RLS:
DROP POLICY IF EXISTS "Users view own bookings" ON public.bookings;
CREATE POLICY "Users view own bookings" ON public.bookings
    FOR SELECT USING (
        auth.uid() = user_id OR
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- Payments RLS:
DROP POLICY IF EXISTS "Authorized view payments" ON public.payments;
CREATE POLICY "Authorized view payments" ON public.payments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = payments.booking_id
              AND (b.owner_id = auth.uid() OR b.user_id = auth.uid())
        ) OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- Refunds RLS:
DROP POLICY IF EXISTS "Authorized view refunds" ON public.refunds;
CREATE POLICY "Authorized view refunds" ON public.refunds
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.id = refunds.booking_id
              AND (b.owner_id = auth.uid() OR b.user_id = auth.uid())
        ) OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- Audit Logs RLS:
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'Admin'
        )
    );

-- Staff Trip Assignments RLS:
DROP POLICY IF EXISTS "View staff assignments" ON public.staff_trip_assignments;
CREATE POLICY "View staff assignments" ON public.staff_trip_assignments
    FOR SELECT USING (
        staff_id = auth.uid() OR
        EXISTS (SELECT 1 FROM public.trips t WHERE t.id = staff_trip_assignments.trip_id AND t.owner_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- Direct client modification on sensitive tables revoked
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.refunds FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seat_locks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.bookings FROM anon, authenticated;
