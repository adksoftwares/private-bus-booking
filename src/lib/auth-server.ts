import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { UserRole } from '@/types/user';
import { Database } from '@/types/database';

export class HttpError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  phone?: string;
  name?: string;
  role: UserRole;
  isAdmin: boolean;
  isOwner: boolean;
  isConductor: boolean;
  isPassenger: boolean;
}

/**
 * Extracts and verifies the Supabase Auth access token from the Authorization header or cookies.
 * Derives user identity strictly on the server (anti-spoofing).
 */
export async function getAuthenticatedUser(req: Request): Promise<AuthenticatedUser | null> {
  try {
    let user = null;
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    let bearerToken = '';
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      bearerToken = authHeader.substring(7).trim();
      if (bearerToken) {
        // 1. Authoritative verification using standard anon key (doesn't fail if service role is missing)
        try {
          const authClient = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
          });
          const { data, error } = await authClient.auth.getUser(bearerToken);
          if (!error && data?.user) {
            user = data.user;
          }
        } catch {
          // ignore and fallback
        }

        // 2. Fallback to admin client if service role is configured
        if (!user) {
          try {
            const supabaseAdmin = getSupabaseAdminClient();
            const { data, error } = await supabaseAdmin.auth.getUser(bearerToken);
            if (!error && data?.user) {
              user = data.user;
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // Fallback: Check SSR cookies if Authorization header was not present or valid
    if (!user) {
      try {
        const { createClient } = await import('@/lib/supabase/server');
        const supabaseServer = await createClient();
        const { data, error } = await supabaseServer.auth.getUser();
        if (!error && data?.user) {
          user = data.user;
        }
      } catch {
        // SSR cookies unavailable or running in context without cookies
      }
    }

    if (!user) {
      return null;
    }

    const uid = user.id;
    const email = user.email;
    const phone = user.phone || (user.user_metadata?.phone as string | undefined);
    const name = (user.user_metadata?.name || user.user_metadata?.displayName || user.user_metadata?.full_name) as string | undefined;

    // Check profiles table for role
    let role: UserRole = 'Passenger';
    let profileData: { role?: string; name?: string; phone?: string | null } | null = null;

    // Query 1: Use user's own token (works via RLS auth.uid() = id)
    if (bearerToken) {
      try {
        const userClient = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${bearerToken}` } }
        });
        const { data: p } = await userClient
          .from('profiles')
          .select('role, name, phone')
          .eq('id', uid)
          .maybeSingle();
        if (p) profileData = p;
      } catch {
        // ignore
      }
    }

    // Query 2: Try admin client if profileData is still empty
    if (!profileData) {
      try {
        const supabaseAdmin = getSupabaseAdminClient();
        const { data: p } = await supabaseAdmin
          .from('profiles')
          .select('role, name, phone')
          .eq('id', uid)
          .maybeSingle();
        if (p) profileData = p;
      } catch {
        // ignore
      }
    }

    if (profileData?.role) {
      role = profileData.role as UserRole;
    } else {
      // Check owners table
      try {
        const supabaseAdmin = getSupabaseAdminClient();
        const { data: owner } = await supabaseAdmin
          .from('owners')
          .select('id')
          .eq('id', uid)
          .maybeSingle();

        if (owner) {
          role = 'Owner';
        }
      } catch {
        // ignore
      }
    }

    return {
      uid,
      email,
      phone: (profileData?.phone ?? phone) || undefined,
      name: profileData?.name || name,
      role,
      isAdmin: role === 'Admin',
      isOwner: role === 'Owner' || role === 'Admin',
      isConductor: role === 'Conductor' || role === 'Owner' || role === 'Admin',
      isPassenger: role === 'Passenger'
    };
  } catch {
    // If token is invalid or expired, return null
    return null;
  }
}

/**
 * Requires any valid authenticated user or throws 401.
 */
export async function requireAuth(req: Request): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    throw new HttpError(401, 'Authentication required. Please sign in to continue.');
  }
  return user;
}

/**
 * Requires an Admin user or throws 403.
 */
export async function requireAdmin(req: Request): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isAdmin) {
    throw new HttpError(403, 'Administrative privileges required for this operation.');
  }
  return user;
}

/**
 * Requires an Owner or Admin user or throws 403.
 */
export async function requireOwner(req: Request): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isOwner && !user.isAdmin) {
    throw new HttpError(403, 'Bus Operator / Owner privileges required for this operation.');
  }
  return user;
}

/**
 * Requires a Conductor, Owner, or Admin user or throws 403.
 */
export async function requireConductor(req: Request): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isConductor && !user.isOwner && !user.isAdmin) {
    throw new HttpError(403, 'Bus Conductor or Staff privileges required for this operation.');
  }
  return user;
}

export const requireStaffOrAdmin = requireConductor;

/**
 * Verifies that the authenticated user owns the resource or is an Admin.
 */
export function assertOwnerOrAdmin(user: AuthenticatedUser, resourceOwnerId: string): void {
  if (user.isAdmin) return;
  if (user.uid !== resourceOwnerId) {
    throw new HttpError(403, 'Access denied: You do not own this resource.');
  }
}

/**
 * Requires that the authenticated user owns the given trip or is an Admin.
 */
export async function requireTripOwnership(req: Request, tripId: string): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (user.isAdmin) return user;

  const supabase = getSupabaseAdminClient();
  const { data: trip, error } = await supabase
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .maybeSingle();

  if (error || !trip) {
    throw new HttpError(404, 'Trip not found.');
  }

  if (trip.owner_id !== user.uid) {
    throw new HttpError(403, 'Access denied: You do not own this trip schedule.');
  }

  return user;
}

/**
 * Requires that the authenticated user is an Admin, the trip owner, or an assigned conductor/driver for the trip.
 */
export async function requireTripStaffAssignment(req: Request, tripId: string): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (user.isAdmin) return user;

  const supabase = getSupabaseAdminClient();
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .select('owner_id')
    .eq('id', tripId)
    .maybeSingle();

  if (tripError || !trip) {
    throw new HttpError(404, 'Trip schedule not found.');
  }

  // Bus owner has authoritative access
  if (trip.owner_id === user.uid) {
    return user;
  }

  // Check staff_trip_assignments
  const { data: assignment, error: assignError } = await supabase
    .from('staff_trip_assignments')
    .select('id, assigned_role')
    .eq('trip_id', tripId)
    .eq('staff_id', user.uid)
    .maybeSingle();

  if (assignError || !assignment) {
    throw new HttpError(403, 'Access denied: You are not assigned to this trip schedule.');
  }

  return user;
}

/**
 * Server-side security audit logging
 */
export async function logAudit(
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
  actorId?: string | null,
  actorRole?: string | null,
  ipAddress?: string | null
): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from('audit_logs').insert([{
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: metadata as unknown as import('@/types/database').Json,
      actor_id: actorId || null,
      actor_role: actorRole || null,
      ip_address: ipAddress || null,
      created_at: new Date().toISOString()
    }]);
  } catch (err) {
    console.error('Failed to record security audit log:', err);
  }
}

