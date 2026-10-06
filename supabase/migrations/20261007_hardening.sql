-- ==============================================================================
-- SRI LANKAN PRIVATE BUS BOOKING SYSTEM — 10/10 PRODUCTION HARDENING MIGRATION
-- Authoritative Schema Constraints, Audit Trail, & ACID Atomic Stored Procedures
-- ==============================================================================

-- 1. AUDIT LOGS TABLE
-- Immutable security audit trail for all sensitive operations
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

-- Performance & Query Indexes for Audit Logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created ON public.audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);

-- 2. HARDENED DATABASE CONSTRAINTS
-- Prevent invalid business values, negative fares, and out-of-range ratings

DO $$ BEGIN
    ALTER TABLE public.trips
        ADD CONSTRAINT chk_trips_positive_fare CHECK (base_fare > 0 AND fare_per_seat > 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.bookings
        ADD CONSTRAINT chk_bookings_positive_amount CHECK (total_amount > 0);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.buses
        ADD CONSTRAINT chk_buses_seat_bounds CHECK (total_seats >= 10 AND total_seats <= 75);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.bus_reviews
        ADD CONSTRAINT chk_reviews_rating_range CHECK (rating >= 1 AND rating <= 5);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE public.payments
        ADD CONSTRAINT uq_payments_order UNIQUE (order_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. ADDITIONAL PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_staff_trip_assignments_trip ON public.staff_trip_assignments(trip_id);
CREATE INDEX IF NOT EXISTS idx_staff_trip_assignments_staff ON public.staff_trip_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status_trip ON public.bookings(status, trip_id);
CREATE INDEX IF NOT EXISTS idx_seat_locks_status_expires ON public.seat_locks(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON public.payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_refunds_booking ON public.refunds(booking_id);

-- ==============================================================================
-- 4. HARDENED ATOMIC POSTGRESQL FUNCTIONS
-- All functions explicitly enforce: SET search_path = public, pg_temp;
-- ==============================================================================

-- 4.1. Atomic Multi-Seat Locking Function (ACID, Anti-Double Booking, Max 6 Seats)
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
BEGIN
    -- Check seat count bounds
    v_seat_count := array_length(p_seat_ids, 1);
    IF v_seat_count IS NULL OR v_seat_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'no_seats_specified');
    END IF;

    IF v_seat_count > 6 THEN
        RETURN jsonb_build_object('success', false, 'reason', 'max_seats_exceeded', 'maxAllowed', 6);
    END IF;

    -- Verify trip exists and is active
    SELECT * INTO v_trip FROM public.trips WHERE id = p_trip_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_not_found');
    END IF;

    IF v_trip.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'trip_cancelled');
    END IF;

    -- Clean up expired locks for this trip first
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    -- Validate each requested seat atomically with row-level locks
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        SELECT * INTO v_existing_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            -- Permanent confirmed booking conflict
            IF v_existing_lock.status = 'booked' THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'already_booked');
            END IF;

            -- Active lock held by a DIFFERENT user/session
            IF v_existing_lock.status = 'locked' AND v_existing_lock.user_id <> p_user_id AND v_existing_lock.expires_at > v_now THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'currently_held');
            END IF;
        END IF;
    END LOOP;

    -- All requested seats are free or expired -> Acquire/renew locks atomically
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

-- 4.2. Atomic Single-Seat Release Function
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

-- 4.3. Atomic Booking Confirmation & Permanent Seat Allocation
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
    v_seat TEXT;
    v_lock RECORD;
BEGIN
    -- Verify that none of these seats are booked by a DIFFERENT booking
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        SELECT * INTO v_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            IF v_lock.status = 'booked' AND v_lock.booking_id <> p_booking_id THEN
                RETURN jsonb_build_object('success', false, 'reason', 'conflicting_booking', 'seat', v_seat);
            END IF;
        END IF;
    END LOOP;

    -- Permanently book the seats
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        INSERT INTO public.seat_locks (trip_id, seat_id, user_id, booking_id, status, locked_at, expires_at)
        VALUES (p_trip_id, v_seat, p_user_id, p_booking_id, 'booked', NOW(), NULL)
        ON CONFLICT (trip_id, seat_id)
        DO UPDATE SET
            user_id = p_user_id,
            booking_id = p_booking_id,
            status = 'booked',
            expires_at = NULL;
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4.4. Atomic Payment Webhook Processing (PayHere IPN Single Transaction)
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
BEGIN
    -- Lock booking row FOR UPDATE
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'booking_not_found');
    END IF;

    -- Idempotency check: If already confirmed, don't duplicate
    IF v_booking.status = 'confirmed' THEN
        RETURN jsonb_build_object('success', true, 'status', 'already_confirmed', 'message', 'Booking already confirmed previously');
    END IF;

    -- Currency check: Sri Lankan Rupee
    IF p_currency <> 'LKR' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'currency_mismatch', 'expected', 'LKR', 'received', p_currency);
    END IF;

    -- Authoritative Amount Validation: Match booking total within 0.01 tolerance
    IF ABS(v_booking.total_amount - p_amount) >= 0.01 THEN
        -- Record audit of potential tampering
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

    -- PayHere status_code '2' = SUCCESS
    IF p_status_code = '2' THEN
        -- 1. Update booking
        UPDATE public.bookings
        SET status = 'confirmed',
            payment_id = v_effective_payment_id,
            updated_at = NOW()
        WHERE id = p_order_id;

        -- 2. Upsert payment record
        INSERT INTO public.payments (id, booking_id, order_id, amount, currency, status, provider, raw_payload, created_at, updated_at)
        VALUES (v_effective_payment_id, p_order_id, p_order_id, p_amount, p_currency, 'completed', 'payhere', p_raw_payload, NOW(), NOW())
        ON CONFLICT (order_id)
        DO UPDATE SET
            status = 'completed',
            amount = p_amount,
            currency = p_currency,
            updated_at = NOW(),
            raw_payload = p_raw_payload;

        -- 3. Mark seat locks as permanently 'booked'
        IF v_booking.seats IS NOT NULL THEN
            FOREACH v_seat IN ARRAY v_booking.seats
            LOOP
                INSERT INTO public.seat_locks (trip_id, seat_id, user_id, booking_id, status, locked_at, expires_at)
                VALUES (v_booking.trip_id, v_seat, COALESCE(v_booking.user_id::text, 'guest'), p_order_id, 'booked', NOW(), NULL)
                ON CONFLICT (trip_id, seat_id)
                DO UPDATE SET
                    user_id = COALESCE(v_booking.user_id::text, 'guest'),
                    booking_id = p_order_id,
                    status = 'booked',
                    expires_at = NULL;
            END LOOP;
        END IF;

        -- 4. Audit log entry
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
        UPDATE public.bookings
        SET status = 'payment_failed',
            updated_at = NOW()
        WHERE id = p_order_id;

        -- Insert failed payment record
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

-- 4.5. Atomic Passenger Boarding Check-In (Strict Staff Assignment & Anti-Double Scan)
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
    -- Check if conductor is Admin or Trip Owner
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

    -- Double scan check
    IF v_booking.boarded = TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'already_boarded',
            'message', 'Passenger has already boarded this bus.',
            'boarded_at', v_booking.boarded_at,
            'boarded_by', v_booking.boarded_by
        );
    END IF;

    -- Mark boarded atomically
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

-- 4.6. Atomic Booking Cancellation & Refund Stored Procedure
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
    p_booking_id TEXT,
    p_caller_id TEXT,
    p_access_token TEXT,
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

    -- Strict Authorization Check (Admin OR matching Account OR matching Access Token. Never phone alone!)
    IF p_is_admin = TRUE THEN
        v_is_authorized := TRUE;
    ELSIF v_booking.user_id IS NOT NULL AND p_caller_id IS NOT NULL AND v_booking.user_id::text = p_caller_id THEN
        v_is_authorized := TRUE;
    ELSIF p_access_token IS NOT NULL AND v_booking.access_token IS NOT NULL AND v_booking.access_token = p_access_token THEN
        v_is_authorized := TRUE;
    END IF;

    IF NOT v_is_authorized THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'unauthorized',
            'message', 'Unauthorized: You are not authorized to cancel this booking.'
        );
    END IF;

    -- Calculate refund based on departure date/time
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
    v_refund_id := 'RF-' || EXTRACT(EPOCH FROM NOW())::BIGINT || '-' || FLOOR(RANDOM() * 900 + 100)::TEXT;

    -- 1. Update Booking
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

    -- 3. Release Seats atomically
    IF v_booking.seats IS NOT NULL THEN
        DELETE FROM public.seat_locks
        WHERE trip_id = v_booking.trip_id
          AND seat_id = ANY(v_booking.seats);
    END IF;

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

-- 4.7. Safe Trip Seat Availability (Prevents Passenger Data Leakage)
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

    -- Return safe masked view: Never expose other passengers' user_id or booking_id!
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
-- 5. ROW LEVEL SECURITY (RLS) FOR NEW & HARDENED TABLES
-- ==============================================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit logs: Strict Admin only access
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'Admin'
        )
    );

-- Revoke dangerous direct client modification of audit_logs
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM anon, authenticated;
