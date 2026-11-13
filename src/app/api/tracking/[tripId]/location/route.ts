import { NextResponse } from 'next/server';
import { authorizeTripTracking, trackingError } from '@/lib/tracking-access';
type Context = { params: Promise<{ tripId: string }> };
export async function POST(req: Request, context: Context) {
  try {
    const { tripId } = await context.params;
    const { db, trip, user } = await authorizeTripTracking(req, tripId, 'location');
    const body = await req.json();
    const latitude = Number(body.latitude), longitude = Number(body.longitude);
    const accuracy = body.accuracy == null ? null : Number(body.accuracy);
    const speed = body.speed == null ? null : Number(body.speed);
    const heading = body.heading == null ? null : Number(body.heading);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return NextResponse.json({ error: 'Valid GPS latitude and longitude are required.' }, { status: 400 });
    }
    if (accuracy !== null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000)) {
      return NextResponse.json({ error: 'Invalid GPS accuracy.' }, { status: 400 });
    }
    const { data: session } = await db.from('trip_tracking_sessions').select('status')
      .eq('trip_id', tripId).maybeSingle();
    if (!session || session.status !== 'live') {
      return NextResponse.json({ error: 'GPS updates are accepted only while the trip is live.' }, { status: 409 });
    }
    const now = new Date().toISOString();
    const suppliedRecordedAt = body.recordedAt ? new Date(String(body.recordedAt)) : null;
    const recordedAt = suppliedRecordedAt && Number.isFinite(suppliedRecordedAt.getTime()) && suppliedRecordedAt.getTime() <= Date.now() + 120000 && suppliedRecordedAt.getTime() >= Date.now() - 7 * 24 * 60 * 60 * 1000
      ? suppliedRecordedAt.toISOString()
      : now;
    const point = {
      trip_id: tripId, owner_id: trip.owner_id, latitude, longitude, accuracy_m: accuracy,
      speed_kmh: speed === null || !Number.isFinite(speed) ? null : Math.max(0, Math.min(speed * 3.6, 250)),
      heading: heading === null || !Number.isFinite(heading) ? null : ((heading % 360) + 360) % 360,
      recorded_at: recordedAt, source_user_id: user.uid
    };
    const { error: insertError } = await db.from('trip_tracking_points').insert(point);
    if (insertError) throw new Error('Unable to save GPS location.');
    const { error: updateError } = await db.from('trip_tracking_sessions').update({
      last_latitude: latitude, last_longitude: longitude, last_accuracy_m: accuracy,
      last_speed_kmh: point.speed_kmh, last_heading: point.heading, last_seen_at: now, updated_at: now
    }).eq('trip_id', tripId);
    if (updateError) throw new Error('Unable to refresh the live bus position.');
    return NextResponse.json({ success: true, recordedAt: now });
  } catch (error) { return trackingError(error); }
}
