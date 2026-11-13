import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export class TrackingAccessError extends Error {
  constructor(public statusCode: number, message: string) { super(message); this.name = 'TrackingAccessError'; }
}

export async function authorizeTripTracking(req: Request, tripId: string, mode: 'view' | 'control' | 'location') {
  const user = await getAuthenticatedUser(req);
  if (!user) throw new TrackingAccessError(401, 'Please sign in to access live bus tracking.');
  const db = getSupabaseAdminClient();
  const { data: trip, error } = await db.from('trips')
    .select('id, owner_id, bus_id, departure_date, departure_time, arrival_time, status')
    .eq('id', tripId).maybeSingle();
  if (error) throw new TrackingAccessError(500, 'Unable to load trip.');
  if (!trip) throw new TrackingAccessError(404, 'Trip not found.');

  if (user.role === 'Admin') return { db, trip, user, access: 'admin' as const };
  if (user.role === 'Owner' && trip.owner_id === user.uid) return { db, trip, user, access: 'owner' as const };

  // Driver and Conductor are the same existing Conductor account role. The account must be assigned to this exact trip.
  if (user.role === 'Conductor') {
    const { data: assignment } = await db.from('staff_trip_assignments')
      .select('id, assigned_role').eq('trip_id', tripId).eq('staff_id', user.uid).maybeSingle();
    if (assignment) return { db, trip, user, access: 'driver_conductor' as const };
  }

  // Customers can track only bookings made while logged in to this same account.
  // Guest bookings have user_id NULL / booking_type='guest' and never pass this check.
  if (user.role === 'Passenger' && mode === 'view') {
    const { data: booking, error: bookingError } = await db.from('bookings')
      .select('id').eq('trip_id', tripId).eq('user_id', user.uid)
      .eq('booking_type', 'account').in('status', ['pending', 'confirmed', 'boarded'])
      .limit(1).maybeSingle();
    if (bookingError) throw new TrackingAccessError(500, 'Unable to verify your booking for this trip.');
    if (booking) return { db, trip, user, access: 'customer' as const };
  }

  throw new TrackingAccessError(403, 'This account is not authorised to track this bus.');
}

export function trackingError(error: unknown) {
  const err = error as { statusCode?: number; message?: string };
  return Response.json({ error: err.message || 'Tracking request failed.' }, {
    status: err.statusCode || 500, headers: { 'Cache-Control': 'private, no-store' }
  });
}