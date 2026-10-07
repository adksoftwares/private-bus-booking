-- ==============================================================================
-- Migration: 20261007_phase2_hardening.sql
-- Description: Phase 2 Application, API, Authentication & Authorization Hardening
--
-- Key Protections:
-- 1. Profile Role Escalation Prevention:
--    - Database trigger preventing non-admins / clients from modifying profiles.role
--    - Revoking direct column UPDATE permission on profiles.role from authenticated/anon
-- 2. Bus Review Tampering Prevention:
--    - Dropping client INSERT RLS policy on public.bus_reviews
--    - Restricting review insertion strictly to verified server-side API (/api/ratings)
-- 3. Owner & Fleet Authorization RLS Hardening:
--    - Enforcing owner/admin verification on bus creation and modification
--    - Enforcing owner/admin verification on trip scheduling
-- ==============================================================================

-- -----------------------------------------------------------------------------
-- 1. PROFILE ROLE ESCALATION PROTECTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check if role is being modified
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        -- Allow Postgres system processes and Supabase service_role
        IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
            -- Check if the requesting user session is an active administrator
            IF NOT EXISTS (
                SELECT 1 FROM public.profiles
                WHERE id = auth.uid() AND role = 'Admin'
            ) THEN
                RAISE EXCEPTION 'Access Denied: Privilege escalation blocked. Only system administrators can modify user roles.'
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- Revoke direct column UPDATE on role from public / authenticated roles
-- Role elevation must happen strictly via server-side service_role or admin procedures
REVOKE UPDATE (role) ON public.profiles FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. BUS REVIEW TAMPERING PREVENTION
-- -----------------------------------------------------------------------------

-- Drop direct client-side insertion policy on bus_reviews
-- This prevents passengers or malicious users from injecting unverified reviews
-- directly via the Supabase client without journey verification
DROP POLICY IF EXISTS "Passengers insert reviews" ON public.bus_reviews;

-- Read reviews remains public
DROP POLICY IF EXISTS "Public read bus reviews" ON public.bus_reviews;
CREATE POLICY "Public read bus reviews" ON public.bus_reviews
    FOR SELECT USING (true);

-- Ensure RLS is active
ALTER TABLE public.bus_reviews ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. FLEET & BUS RLS INTEGRITY
-- -----------------------------------------------------------------------------

ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active buses" ON public.buses;
CREATE POLICY "Public read active buses" ON public.buses
    FOR SELECT USING (status = 'active' OR auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin'));

DROP POLICY IF EXISTS "Owners manage own buses" ON public.buses;

-- Explicit Owner INSERT with role verification
DROP POLICY IF EXISTS "Owners can insert buses" ON public.buses;
CREATE POLICY "Owners can insert buses" ON public.buses
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('Owner', 'Admin')
        )
    );

-- Explicit Owner UPDATE with ownership verification
DROP POLICY IF EXISTS "Owners can update own buses" ON public.buses;
CREATE POLICY "Owners can update own buses" ON public.buses
    FOR UPDATE USING (
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- Explicit Owner DELETE with ownership verification
DROP POLICY IF EXISTS "Owners can delete own buses" ON public.buses;
CREATE POLICY "Owners can delete own buses" ON public.buses
    FOR DELETE USING (
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

-- -----------------------------------------------------------------------------
-- 4. TRIP SCHEDULING RLS INTEGRITY
-- -----------------------------------------------------------------------------

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read scheduled trips" ON public.trips;
CREATE POLICY "Public read scheduled trips" ON public.trips
    FOR SELECT USING (
        status = 'scheduled' OR
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

DROP POLICY IF EXISTS "Owners can insert trips" ON public.trips;
CREATE POLICY "Owners can insert trips" ON public.trips
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id AND
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('Owner', 'Admin')
        )
    );

DROP POLICY IF EXISTS "Owners can update own trips" ON public.trips;
CREATE POLICY "Owners can update own trips" ON public.trips
    FOR UPDATE USING (
        auth.uid() = owner_id OR
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'Admin')
    );

COMMENT ON TRIGGER trg_prevent_profile_role_escalation ON public.profiles IS
'Phase 2 Security Trigger: Prevents unauthorized privilege escalation to Admin or Owner.';
