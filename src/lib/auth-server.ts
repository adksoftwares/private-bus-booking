import { getAdminAuth, getAdminDatabase } from '@/lib/serverFirebase';
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
 * Extracts and verifies the Firebase ID token from the Authorization header.
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

    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    const name = decodedToken.name;
    const phone = (decodedToken as Record<string, unknown>).phone_number as string | undefined;

    // Check custom claims first
    let role: UserRole = 'Passenger';
    if (decodedToken.role) {
      const claimRole = decodedToken.role as string;
      if (claimRole === 'Admin') role = 'Admin';
      else if (claimRole === 'Owner') role = 'Owner';
      else if (claimRole === 'Conductor' || claimRole === 'Driver') role = 'Conductor';
    } else {
      // Look up user in RTDB to determine authoritative role
      const db = getAdminDatabase();
      const [userSnap, ownerSnap] = await Promise.all([
        db.ref(`users/${uid}`).once('value'),
        db.ref(`owners/${uid}`).once('value')
      ]);

      if (userSnap.exists()) {
        const dbRole = userSnap.val().role;
        if (dbRole === 'Admin') role = 'Admin';
        else if (dbRole === 'Owner') role = 'Owner';
        else if (dbRole === 'Conductor') role = 'Conductor';
      } else if (ownerSnap.exists()) {
        role = 'Owner';
      }
    }

    return {
      uid,
      email,
      phone,
      name,
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
    throw new HttpError(403, 'Access denied. Administrator privileges required.');
  }
  return user;
}

/**
 * Requires a Bus Operator (Owner) or Admin or throws 403.
 */
export async function requireOwner(req: Request): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isOwner && !user.isAdmin) {
    throw new HttpError(403, 'Access denied. Registered bus operator privileges required.');
  }
  return user;
}

/**
 * Requires a Conductor, Owner, or Admin or throws 403.
 */
export async function requireStaffOrAdmin(req: Request): Promise<AuthenticatedUser> {
  const user = await requireAuth(req);
  if (!user.isConductor && !user.isOwner && !user.isAdmin) {
    throw new HttpError(403, 'Access denied. Authorized bus crew or conductor privileges required.');
  }
  return user;
}

/**
 * Verifies that the authenticated caller owns the given trip, or is an Admin.
 */
export async function requireTripOwnership(req: Request, tripId: string): Promise<{ user: AuthenticatedUser; trip: Record<string, unknown> }> {
  const user = await requireOwner(req);
  const db = getAdminDatabase();
  const tripSnap = await db.ref(`trips/${tripId}`).once('value');

  if (!tripSnap.exists()) {
    throw new HttpError(404, 'Scheduled trip not found.');
  }

  const trip = tripSnap.val();
  if (!user.isAdmin && trip.ownerId !== user.uid) {
    throw new HttpError(403, 'Access denied. You do not own this trip schedule.');
  }

  return { user, trip };
}

/**
 * Verifies that the staff member is assigned to this trip or bus, or is an Admin/Owner of the trip.
 */
export async function requireConductorTripAccess(req: Request, tripId: string): Promise<{ user: AuthenticatedUser; trip: Record<string, unknown> }> {
  const user = await requireStaffOrAdmin(req);
  const db = getAdminDatabase();
  const tripSnap = await db.ref(`trips/${tripId}`).once('value');

  if (!tripSnap.exists()) {
    throw new HttpError(404, 'Trip record not found for verification.');
  }

  const trip = tripSnap.val();

  // Admins and the trip's direct owner have full access
  if (user.isAdmin || trip.ownerId === user.uid) {
    return { user, trip };
  }

  // If conductor, check trip assignment
  // Supports: trip.conductorId, trip.assignedStaff, or bus.conductorId
  let isAssigned = false;
  if (trip.conductorId === user.uid) {
    isAssigned = true;
  } else if (trip.assignedStaff && typeof trip.assignedStaff === 'object' && trip.assignedStaff[user.uid]) {
    isAssigned = true;
  } else if (trip.busId) {
    const busSnap = await db.ref(`buses/${trip.busId}`).once('value');
    if (busSnap.exists()) {
      const bus = busSnap.val();
      if (bus.conductorId === user.uid || (bus.assignedStaff && bus.assignedStaff[user.uid])) {
        isAssigned = true;
      }
    }
  }

  // In standard Sri Lankan private bus network operations, if conductor is verified staff of the fleet
  // and no fine-grained restriction is set on the trip, allow verified crew of that operator
  if (!isAssigned && trip.ownerId) {
    const crewSnap = await db.ref(`operatorStaff/${trip.ownerId}/${user.uid}`).once('value');
    if (crewSnap.exists()) {
      isAssigned = true;
    }
  }

  if (!isAssigned) {
    throw new HttpError(403, 'Access denied. You are not assigned as the conductor for this trip.');
  }

  return { user, trip };
}
