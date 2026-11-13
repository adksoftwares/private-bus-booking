-- Live GPS tracking, trip supervisor permissions and owner-managed contact numbers.
CREATE TABLE IF NOT EXISTS public.trip_tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id TEXT NOT NULL UNIQUE REFERENCES public.trips(id) ON DELETE CASCADE,
  bus_id TEXT NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','paused')),
  started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
  last_latitude DOUBLE PRECISION, last_longitude DOUBLE PRECISION,
  last_accuracy_m DOUBLE PRECISION, last_speed_kmh DOUBLE PRECISION, last_heading DOUBLE PRECISION,
  last_seen_at TIMESTAMPTZ, started_by UUID REFERENCES auth.users(id), ended_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_tracking_coordinates CHECK (
    (last_latitude IS NULL AND last_longitude IS NULL) OR
    (last_latitude BETWEEN -90 AND 90 AND last_longitude BETWEEN -180 AND 180)
  )
);
CREATE TABLE IF NOT EXISTS public.trip_tracking_points (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m DOUBLE PRECISION, speed_kmh DOUBLE PRECISION, heading DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), source_user_id UUID REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.owner_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, phone TEXT NOT NULL, normalized_phone TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('supervisor','driver','conductor','office','emergency')),
  bus_id TEXT REFERENCES public.buses(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES public.trips(id) ON DELETE CASCADE,
  linked_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  can_control_tracking BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_all_trips BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(owner_id, normalized_phone, contact_type, trip_id)
);
CREATE INDEX IF NOT EXISTS idx_tracking_points_trip_time ON public.trip_tracking_points(trip_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_owner_status ON public.trip_tracking_sessions(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_owner_contacts_phone ON public.owner_contacts(normalized_phone, active);
CREATE INDEX IF NOT EXISTS idx_owner_contacts_owner ON public.owner_contacts(owner_id, contact_type);
ALTER TABLE public.trip_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_tracking_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage tracking sessions" ON public.trip_tracking_sessions;
CREATE POLICY "Owners manage tracking sessions" ON public.trip_tracking_sessions FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners read tracking points" ON public.trip_tracking_points;
CREATE POLICY "Owners read tracking points" ON public.trip_tracking_points FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Owners manage contacts" ON public.owner_contacts;
CREATE POLICY "Owners manage contacts" ON public.owner_contacts FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
-- Passenger GPS reads are mediated by the booking-token-validated server API; GPS tables are not public.
