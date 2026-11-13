import { NextResponse } from 'next/server';
import { authorizeTripTracking, trackingError } from '@/lib/tracking-access';
type Context = { params: Promise<{ tripId: string }> };

export async function GET(req: Request, context: Context) {
  try {
    const { tripId } = await context.params;
    const { db, trip, access } = await authorizeTripTracking(req, tripId, 'view');
    const { data: session } = await db.from('trip_tracking_sessions')
      .select('status, started_at, ended_at, last_latitude, last_longitude, last_accuracy_m, last_speed_kmh, last_heading, last_seen_at')
      .eq('trip_id', tripId).maybeSingle();
    const { data: points, error } = await db.from('trip_tracking_points')
      .select('latitude, longitude, accuracy_m, speed_kmh, heading, recorded_at')
      .eq('trip_id', tripId).order('recorded_at', { ascending: true }).limit(5000);
    if (error) throw new Error('Unable to load GPS history.');
    return NextResponse.json({
      trip: { id: trip.id, busId: trip.bus_id, departureDate: trip.departure_date, departureTime: trip.departure_time, arrivalTime: trip.arrival_time },
      session: session || { status: 'scheduled' }, points: points || [], viewerRole: access, refreshedAt: new Date().toISOString()
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return trackingError(error); }
}

export async function POST(req: Request, context: Context) {
  try {
    const { tripId } = await context.params;
    const { db, trip, user } = await authorizeTripTracking(req, tripId, 'control');
    const body = await req.json();
    const action = body.action;
    if (!['start', 'pause', 'resume', 'stop'].includes(action)) return NextResponse.json({ error: 'Invalid tracking action.' }, { status: 400 });
    const { data: current } = await db.from('trip_tracking_sessions').select('status').eq('trip_id', tripId).maybeSingle();
    if (action === 'start' && current && current.status !== 'scheduled') return NextResponse.json({ error: 'Tracking has already started.' }, { status: 409 });
    if (action === 'pause' && current?.status !== 'live') return NextResponse.json({ error: 'Only a live trip can be paused.' }, { status: 409 });
    if (action === 'resume' && current?.status !== 'paused') return NextResponse.json({ error: 'Only a paused trip can resume.' }, { status: 409 });
    if (action === 'stop' && (!current || current.status === 'completed')) return NextResponse.json({ error: 'There is no active trip to finish.' }, { status: 409 });
    const now = new Date().toISOString();
    const status = action === 'start' || action === 'resume' ? 'live' : action === 'pause' ? 'paused' : 'completed';
    const patch: Record<string, unknown> = { trip_id: tripId, bus_id: trip.bus_id, owner_id: trip.owner_id, status, updated_at: now };
    if (action === 'start') { patch.started_at = now; patch.started_by = user.uid; }
    if (action === 'stop') { patch.ended_at = now; patch.ended_by = user.uid; }
    const { error } = await db.from('trip_tracking_sessions').upsert(patch, { onConflict: 'trip_id' });
    if (error) throw new Error('Unable to update GPS session. Apply the tracking database migration first.');
    return NextResponse.json({ success: true, status, updatedAt: now }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return trackingError(error); }
}