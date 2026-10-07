import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { invalidateTripSeatsCache } from '@/app/api/seats/status/route';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'seat-unlock', 60, 60);

    const body = await req.json();
    const { tripId, seatId, guestSessionId } = body;

    if (!tripId || !seatId) {
      return NextResponse.json({ error: 'tripId and seatId are required' }, { status: 400 });
    }

    let effectiveUserId = guestSessionId || '';
    let isAdmin = false;
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const user = await getAuthenticatedUser(req);
      if (user?.uid) effectiveUserId = user.uid;
      if (user?.isAdmin) isAdmin = true;
    }

    const supabase = getSupabaseAdminClient();

    // Release lock authoritatively using unlock_seat_atomic RPC
    const callerId = isAdmin ? 'admin' : (effectiveUserId || '');
    const { error: rpcError } = await supabase.rpc('unlock_seat_atomic', {
      p_trip_id: tripId,
      p_seat_id: seatId,
      p_user_id: callerId
    });

    if (rpcError) {
      console.error("Seat unlock RPC error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    // Invalidate seat status cache for this trip so subsequent reads get updated state immediately
    invalidateTripSeatsCache(tripId);

    return NextResponse.json({ success: true, releasedSeat: seatId });

  } catch (error: unknown) {
    console.error("Seat unlock error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to unlock seat' }, { status: 500 });
  }
}
