-- ==============================================================================
-- SRI LANKAN PRIVATE BUS BOOKING SYSTEM — SUPABASE POSTGRESQL SCHEMA
-- Authoritative Relational Database with Row Level Security (RLS) & Atomic Transactions
-- ==============================================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. ENUMS & DOMAINS
-- ==============================================================================
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('Passenger', 'Owner', 'Conductor', 'Admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'payment_failed', 'cancelled', 'boarded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE booking_type AS ENUM ('guest', 'account');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE seat_lock_status AS ENUM ('locked', 'booked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. PROFILES TABLE (App User Metadata linked to auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'Passenger',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 4. OWNERS TABLE (Fleet Operators)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.owners (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    nic TEXT,
    address TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 5. STAFF TABLE (Drivers & Conductors assigned by Bus Owners)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL CHECK (role IN ('Conductor', 'Driver')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 6. BUSES TABLE (Registered Private Coaches)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.buses (
    id TEXT PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reg_number TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    total_seats INTEGER NOT NULL CHECK (total_seats > 0 AND total_seats <= 100),
    seat_layout JSONB NOT NULL DEFAULT '{}'::jsonb,
    amenities TEXT[] DEFAULT '{}',
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 7. ROUTES TABLE (Intercity & Expressway Routes)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.routes (
    id TEXT PRIMARY KEY,
    start_city TEXT NOT NULL,
    end_city TEXT NOT NULL,
    stops JSONB DEFAULT '[]'::jsonb,
    distance_km NUMERIC,
    est_duration TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 8. TRIPS TABLE (Scheduled Journeys with Individual Bus Fares)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.trips (
    id TEXT PRIMARY KEY,
    bus_id TEXT NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    route_id TEXT REFERENCES public.routes(id),
    route_snapshot JSONB NOT NULL,
    bus_snapshot JSONB NOT NULL,
    departure_date DATE NOT NULL,
    departure_time TIME NOT NULL,
    arrival_time TIME,
    duration TEXT,
    base_fare NUMERIC(10,2) NOT NULL,
    fare_per_seat NUMERIC(10,2) NOT NULL,
    operator_name TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'departed', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 9. BOOKINGS TABLE (Customer Reservations with Guest & Account Support)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bookings (
    id TEXT PRIMARY KEY,
    booking_reference TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    booking_type booking_type NOT NULL DEFAULT 'guest',
    trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE RESTRICT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    passenger_name TEXT NOT NULL,
    passenger_phone TEXT NOT NULL,
    passenger_email TEXT,
    passenger_details JSONB NOT NULL DEFAULT '{}'::jsonb,
    seats TEXT[] NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    fares JSONB NOT NULL DEFAULT '{}'::jsonb,
    status booking_status NOT NULL DEFAULT 'pending',
    boarded BOOLEAN NOT NULL DEFAULT FALSE,
    boarded_at TIMESTAMPTZ,
    boarded_by TEXT,
    payment_id TEXT,
    refund_id TEXT,
    trip_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ
);

-- ==============================================================================
-- 10. SEAT_LOCKS TABLE (Authoritative Seat Inventory & Concurrency Protection)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.seat_locks (
    id BIGSERIAL PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    seat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    booking_id TEXT REFERENCES public.bookings(id) ON DELETE CASCADE,
    status seat_lock_status NOT NULL DEFAULT 'locked',
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT uq_trip_seat UNIQUE (trip_id, seat_id)
);

-- ==============================================================================
-- 11. PAYMENTS TABLE (Audit Trail for PayHere Gateway)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'LKR',
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    provider TEXT NOT NULL DEFAULT 'payhere',
    raw_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 12. REFUNDS TABLE (Audit Trail for Cancellations)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.refunds (
    id TEXT PRIMARY KEY,
    booking_id TEXT NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    user_id TEXT,
    original_amount NUMERIC(10,2) NOT NULL,
    refund_amount NUMERIC(10,2) NOT NULL,
    refund_percentage INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending_payout', 'completed', 'no_refund')),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 13. BUS_REVIEWS TABLE (Vehicle-Specific Passenger Reviews)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bus_reviews (
    id BIGSERIAL PRIMARY KEY,
    bus_id TEXT NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
    booking_id TEXT REFERENCES public.bookings(id),
    user_id UUID REFERENCES auth.users(id),
    passenger_name TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    cleanliness_rating INTEGER,
    punctuality_rating INTEGER,
    comfort_rating INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- 14. STAFF_TRIP_ASSIGNMENTS TABLE (Conductor Authorization per Trip)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff_trip_assignments (
    id BIGSERIAL PRIMARY KEY,
    trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_role TEXT NOT NULL CHECK (assigned_role IN ('Conductor', 'Driver')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_staff_trip UNIQUE (trip_id, staff_id)
);

-- ==============================================================================
-- 15. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_trips_search ON public.trips(departure_date, status);
CREATE INDEX IF NOT EXISTS idx_trips_owner ON public.trips(owner_id);
CREATE INDEX IF NOT EXISTS idx_buses_owner ON public.buses(owner_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON public.bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_bookings_reference ON public.bookings(booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_access_token ON public.bookings(access_token);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_phone ON public.bookings(passenger_phone);
CREATE INDEX IF NOT EXISTS idx_seat_locks_trip ON public.seat_locks(trip_id);
CREATE INDEX IF NOT EXISTS idx_seat_locks_expiry ON public.seat_locks(expires_at) WHERE status = 'locked';
CREATE INDEX IF NOT EXISTS idx_bus_reviews_bus ON public.bus_reviews(bus_id);

-- ==============================================================================
-- 16. ATOMIC POSTGRESQL FUNCTIONS (ACID Double-Booking Prevention & Boarding)
-- ==============================================================================

-- 16.1. Atomic Multi-Seat Locking Function
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
AS $$
DECLARE
    v_seat TEXT;
    v_existing_lock RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_expires_at TIMESTAMPTZ := NOW() + (p_duration_seconds || ' seconds')::INTERVAL;
BEGIN
    -- Sweep expired locks for this trip first
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND status = 'locked'
      AND expires_at < v_now;

    -- Validate each seat atomically
    FOREACH v_seat IN ARRAY p_seat_ids
    LOOP
        SELECT * INTO v_existing_lock
        FROM public.seat_locks
        WHERE trip_id = p_trip_id AND seat_id = v_seat
        FOR UPDATE;

        IF FOUND THEN
            -- If already booked permanently, conflict!
            IF v_existing_lock.status = 'booked' THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'already_booked');
            END IF;

            -- If actively locked by another user and not expired, conflict!
            IF v_existing_lock.status = 'locked' AND v_existing_lock.user_id <> p_user_id AND v_existing_lock.expires_at > v_now THEN
                RETURN jsonb_build_object('success', false, 'conflicting_seat', v_seat, 'reason', 'currently_held');
            END IF;
        END IF;
    END LOOP;

    -- All requested seats are free or expired -> Acquire locks atomically
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

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 16.2. Atomic Single-Seat Release Function
CREATE OR REPLACE FUNCTION public.unlock_seat_atomic(
    p_trip_id TEXT,
    p_seat_id TEXT,
    p_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.seat_locks
    WHERE trip_id = p_trip_id
      AND seat_id = p_seat_id
      AND status = 'locked'
      AND user_id = p_user_id;

    RETURN FOUND;
END;
$$;

-- 16.3. Atomic Booking Confirmation & Permanent Seat Allocation
CREATE OR REPLACE FUNCTION public.confirm_booking_seats_atomic(
    p_trip_id TEXT,
    p_seat_ids TEXT[],
    p_booking_id TEXT,
    p_user_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_seat TEXT;
BEGIN
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

    RETURN TRUE;
END;
$$;

-- 16.4. Atomic Passenger Boarding Check-In (Anti-Double Scan)
CREATE OR REPLACE FUNCTION public.board_passenger_atomic(
    p_booking_id TEXT,
    p_conductor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_booking RECORD;
BEGIN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found', 'message', 'Booking not found');
    END IF;

    IF v_booking.status = 'cancelled' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'cancelled', 'message', 'Ticket was cancelled and refunded');
    END IF;

    IF v_booking.status <> 'confirmed' AND v_booking.status <> 'boarded' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unconfirmed', 'message', 'Ticket is unpaid or pending');
    END IF;

    IF v_booking.boarded = TRUE THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', 'already_boarded',
            'message', 'Passenger has already boarded this bus',
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

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Passenger successfully boarded',
        'boarded_at', NOW()
    );
END;
$$;

-- ==============================================================================
-- 17. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
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

-- Profiles: Users can read and update only their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Buses: Public can view active buses; owners can manage their own
CREATE POLICY "Public read active buses" ON public.buses
    FOR SELECT USING (true);

CREATE POLICY "Owners manage own buses" ON public.buses
    FOR ALL USING (auth.uid() = owner_id);

-- Trips: Public can view scheduled trips; owners can manage own trips
CREATE POLICY "Public read scheduled trips" ON public.trips
    FOR SELECT USING (true);

CREATE POLICY "Owners manage own trips" ON public.trips
    FOR ALL USING (auth.uid() = owner_id);

-- Routes: Public read routes
CREATE POLICY "Public read routes" ON public.routes
    FOR SELECT USING (true);

-- Seat Locks: Public read seat locks to render real-time seat availability
CREATE POLICY "Public read seat locks" ON public.seat_locks
    FOR SELECT USING (true);

-- Bookings: Authenticated users can view their own; owners can view bookings on their trips
CREATE POLICY "Users view own bookings" ON public.bookings
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = owner_id);

-- Reviews: Public read reviews; authenticated passengers can create
CREATE POLICY "Public read bus reviews" ON public.bus_reviews
    FOR SELECT USING (true);

CREATE POLICY "Passengers insert reviews" ON public.bus_reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable Realtime publication for seat locks
ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_locks;
