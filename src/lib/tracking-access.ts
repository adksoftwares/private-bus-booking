import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export class TrackingAccessError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export function normalizePhone(value: string): string {
  return value.replace(/[^0-9]/g, '').replace(/^0/, '94');
}
export async function getTripForTracking(tripId: string) {
  const db = getSupabaseAdminClient();
  const { data: trip, error } = await db.from('trips')
    .select('id, owner_id, bus_id, departure_date, departure_time, arrival_time, status')
    .eq('id', tripId).maybeSingle();
  if (error) throw new TrackingAccessError(500, 'Unable to load trip.');
  if (!trip) throw new TrackingAccessError(404, 'Trip not found.');
  return { db, trip };
}
export async function authorizeTripTracking(req: Request, tripId: string, mode: 'view' | 'control' | 'location') {
  const user = await getAuthenticatedUser(req);
  if (!user) throw new TrackingAccessError(401, 'Please sign in to continue.');
  const { db, trip } = await getTripForTracking(tripId);
  if (user.isAdmin || user.uid === trip.owner_id) return { db, trip, user, access: 'owner' as const };
  const { data: contact } = await db.from('owner_contacts')
    .select('id, contact_type, can_control_tracking, can_view_all_trips')
    .eq('owner_id', trip.owner_id).eq('normalized_phone', normalizePhone(user.phone || ''))
    .eq('active', true)
    .or('trip_id.is.null,trip_id.eq.' + tripId)
    .or('bus_id.is.null,bus_id.eq.' + trip.bus_id)
    .limit(1).maybeSingle();
  if (contact?.contact_type === 'supervisor' && (mode === 'view' || contact.can_control_tracking)) {
    return { db, trip, user, access: 'supervisor' as const };
  }
  if (contact?.contact_type === 'driver' && mode !== 'view') {
    return { db, trip, user, access: 'driver' as const };
  }
  const { data: assignment } = await db.from('staff_trip_assignments')
    .select('assigned_role').eq('trip_id', tripId).eq('staff_id', user.uid).maybeSingle();
  if (assignment && (mode === 'view' || assignment.assigned_role === 'Driver')) {
    return { db, trip, user, access: 'driver' as const };
  }
  throw new TrackingAccessError(403, 'You are not authorised to access this bus tracking session.');
}
export function trackingError(error: unknown) {
  const err = error as { statusCode?: number; message?: string };
  return Response.json({ error: err.message || 'Tracking request failed.' }, { status: err.statusCode || 500 });
}
