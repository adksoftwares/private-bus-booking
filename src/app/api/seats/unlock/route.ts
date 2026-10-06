import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'seat-unlock', 60, 60);

    const body = await req.json();
    const { tripId, seatId, guestSessionId } = body;

    if (!tripId || !seatId) {
      return NextResponse.json({ error: 'tripId and seatId are required' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);
    const effectiveUserId = user?.uid || guestSessionId || '';

    const supabase = getSupabaseAdminClient();

    // Release lock if it belongs to this user and is still 'locked'
    let query = supabase
      .from('seat_locks')
      .delete()
      .eq('trip_id', tripId)
      .eq('seat_id', seatId)
      .eq('status', 'locked');

    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }

    const { error } = await query;

    if (error) {
      console.error("Seat unlock error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, releasedSeat: seatId });

  } catch (error: unknown) {
    console.error("Seat unlock error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to unlock seat' }, { status: 500 });
  }
}
