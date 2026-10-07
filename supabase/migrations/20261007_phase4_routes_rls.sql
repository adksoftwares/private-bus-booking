-- ==============================================================================
-- Migration: 20261007_phase4_routes_rls.sql
-- Description: Enable authenticated users/bus operators to insert and update routes
-- ==============================================================================

-- 1. Ensure routes has RLS enabled
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent duplicates
DROP POLICY IF EXISTS "Public read routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users insert routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users update routes" ON public.routes;
DROP POLICY IF EXISTS "Authenticated users manage routes" ON public.routes;

-- 3. Read policy for all clients (public)
CREATE POLICY "Public read routes" ON public.routes
    FOR SELECT USING (true);

-- 4. Operators and authenticated users can insert new routes when scheduling trips
CREATE POLICY "Authenticated users insert routes" ON public.routes
    FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Operators and authenticated users can update routes if intermediate stops change
CREATE POLICY "Authenticated users update routes" ON public.routes
    FOR UPDATE TO authenticated USING (true);

-- 6. Grant schema and table permissions
GRANT ALL ON TABLE public.routes TO authenticated, service_role;
