-- ==============================================================================
-- PHASE 5: SEAT LOCKS FOREIGN KEY RESILIENCY & RPC PERMISSIONS HARDENING
-- ==============================================================================

-- 1. Update lock_seats_atomic to prevent foreign key violations on uncommitted/temporary seat locks
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

    -- Coerce p_booking_id to NULL if it does not exist in bookings table (temporary seat selection before checkout)
    IF p_booking_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = p_booking_id) THEN
        p_booking_id := NULL;
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

-- 2. Fix ambiguous column reference in get_trip_seat_availability
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
    -- Clean up expired locks first (qualified table prefix to avoid ambiguity with output variable status)
    DELETE FROM public.seat_locks sl
    WHERE sl.trip_id = p_trip_id
      AND sl.status = 'locked'
      AND sl.expires_at < NOW();

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

-- 3. Fix foreign key ordering in create_pending_booking_atomic (Insert into bookings before seat_locks)
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
    p_duration_seconds INTEGER DEFAULT 600,
    p_guest_session_id TEXT DEFAULT NULL
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

    v_effective_user_id := COALESCE(
        v_user_uuid::text, 
        NULLIF(p_guest_session_id, ''), 
        'gst_' || SUBSTRING(p_access_token_hash, 1, 12)
    );

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

            -- Allow proceeding if the lock already belongs to the current user/guest
            IF v_existing_lock.status = 'locked' 
               AND v_existing_lock.expires_at > v_now
               AND (
                 (v_existing_lock.booking_id IS NOT NULL AND v_existing_lock.booking_id <> p_order_id)
                 OR (v_existing_lock.booking_id IS NULL AND v_existing_lock.user_id <> v_effective_user_id AND (p_guest_session_id IS NULL OR v_existing_lock.user_id <> p_guest_session_id))
               ) THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'currently_held', 'message', 'Seat ' || v_seat || ' is currently held by another passenger.');
            END IF;
        END IF;
    END LOOP;

    -- 1. Insert Booking Record FIRST so foreign key seat_locks_booking_id_fkey is satisfied
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

    -- 2. Acquire or update locks in seat_locks with booking_id = p_order_id (FK succeeds!)
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

    -- 3. Audit Log
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

-- 4. Grant permissions for all atomic security definer functions to anon, authenticated, and service_role
GRANT EXECUTE ON FUNCTION public.lock_seats_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unlock_seat_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.board_passenger_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_trip_seat_availability TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_booking_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_booking_seats_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook_atomic TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_booking_atomic TO anon, authenticated, service_role;
GRANT SELECT ON public.seat_locks TO anon, authenticated, service_role;
