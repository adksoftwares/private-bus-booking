import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { authorizeTripTracking, getTripForTracking, trackingError } from '@/lib/tracking-access';
type Context = { params: Promise<{ tripId: string }> };
function safeTokenMatch(token: string, storedHash: string | null, legacyToken: string | null) {
  if (storedHash) {
    const supplied = crypto.createHash('sha256').update(token).digest('hex');
    return supplied.length === storedHash.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(storedHash));
  }
  return Boolean(legacyToken && token === legacyToken);
}
export async function GET(req: Request, context: Context) {
  try {
    const { tripId } = await context.params;
    const { searchParams } = new URL(req.url);
    const bookingReference = searchParams.get('bookingReference');
    const accessToken = searchParams.get('accessToken');
    let db: any;
    let trip: any;
    let viewerRole = 'customer';
    if (bookingReference && accessToken) {
      db = getSupabaseAdminClient();
      const { data: booking } = await db.from('bookings')
        .select('id, trip_id, access_token_hash, access_token, status')
        .eq('booking_reference', bookingReference.trim()).eq('trip_id', tripId).maybeSingle();
      if (!booking || !safeTokenMatch(accessToken, booking.access_token_hash, booking.access_token)) {
        return NextResponse.json({ error: 'Invalid booking tracking access.' }, { status: 403 });
      }
      if (booking.status === 'cancelled' || booking.status === 'payment_failed') {
        return NextResponse.json({ error: 'Tracking is unavailable for this booking.' }, { status: 403 });
      }
      ({ db, trip } = await getTripForTracking(tripId));
    } else {
      const authorised = await authorizeTripTracking(req, tripId, 'view');
      ({ db, trip } = authorised);
      viewerRole = authorised.access;
    }
    const { data: session } = await db.from('trip_tracking_sessions')
      .select('status, started_at, ended_at, last_latitude, last_longitude, last_accuracy_m, last_speed_kmh, last_heading, last_seen_at')
      .eq('trip_id', tripId).maybeSingle();
    const { data: points, error } = await db.from('trip_tracking_points')
      .select('latitude, longitude, accuracy_m, speed_kmh, heading, recorded_at')
      .eq('trip_id', tripId).order('recorded_at', { ascending: true }).limit(5000);
    if (error) throw new Error('Unable to load GPS history.');
    return NextResponse.json({
      trip: { id: trip.id, departureDate: trip.departure_date, departureTime: trip.departure_time, arrivalTime: trip.arrival_time },
      session: session || { status: 'scheduled' }, points: points || [], viewerRole, refreshedAt: new Date().toISOString()
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) { return trackingError(error); }
}
export async function POST(req: Request, context: Context) {
  try {
    const { tripId } = await context.params;
    const authorised = await authorizeTripTracking(req, tripId, 'control');
    const body = await req.json();
    const action = body.action;
    if (!['start', 'stop', 'pause', 'resume'].includes(action)) {
      return NextResponse.json({ error: 'Invalid tracking action.' }, { status: 400 });
    }
    const { db, trip, user } = authorised;
    const now = new Date().toISOString();
    const { data: current } = await db.from('trip_tracking_sessions').select('id, status')
      .eq('trip_id', tripId).maybeSingle();
    if (action === 'start' && current?.status === 'completed') {
      return NextResponse.json({ error: 'A completed trip cannot be restarted.' }, { status: 409 });
    }
    if (action === 'stop' && !current) return NextResponse.json({ error: 'Tracking has not started.' }, { status: 409 });
    const patch: Record<string, unknown> = action === 'start' || action === 'resume'
      ? { status: 'live', started_by: user.uid, updated_at: now, ...(!current ? { started_at: now } : {}) }
      : action === 'pause' ? { status: 'paused', updated_at: now }
      : { status: 'completed', ended_at: now, ended_by: user.uid, updated_at: now };
    const { error } = await db.from('trip_tracking_sessions').upsert({
      trip_id: tripId, bus_id: trip.bus_id, owner_id: trip.owner_id, ...patch
    }, { onConflict: 'trip_id' });
    if (error) throw new Error('Unable to update tracking session.');
    return NextResponse.json({ success: true, status: patch.status, updatedAt: now });
  } catch (error) { return trackingError(error); }
}
