import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { UserRole } from '@/types/user';

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
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.substring(7).trim();
    if (!token) return null;

    const supabase = getSupabaseAdminClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const uid = user.id;
    const email = user.email;
    const phone = user.phone || (user.user_metadata?.phone as string | undefined);
    const name = (user.user_metadata?.name || user.user_metadata?.displayName || user.user_metadata?.full_name) as string | undefined;

    // Check profiles table for role
    let role: UserRole = 'Passenger';
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, name, phone')
      .eq('id', uid)
      .maybeSingle();

    if (profile?.role) {
      role = profile.role as UserRole;
    } else {
      // Check owners table
      const { data: owner } = await supabase
        .from('owners')
        .select('id')
        .eq('id', uid)
        .maybeSingle();

      if (owner) {
        role = 'Owner';
      }
    }

    return {
      uid,
      email,
      phone: profile?.phone || phone,
      name: profile?.name || name,
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
