import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';

export async function GET(req: Request) {
  try {
    enforceRateLimit(req, 'seat_status', 60, 60);

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');
    const sessionId = searchParams.get('sessionId') || searchParams.get('userId');

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);
    const callerId = user?.uid || sessionId || null;
    const supabase = getSupabaseAdminClient();

    // 1. Atomic PostgreSQL RPC get_trip_seat_availability (safe privacy-masked query & auto-sweep)
    const { data: rpcSeats, error: rpcError } = await supabase.rpc('get_trip_seat_availability', {
      p_trip_id: tripId,
      p_caller_user_id: callerId || undefined
    });

    if (!rpcError && rpcSeats && Array.isArray(rpcSeats)) {
      const statuses: Record<string, { status: 'locked' | 'booked'; isMine: boolean; userId: string; expiresAt?: number }> = {};
      for (const s of rpcSeats) {
        const expTime = s.expires_at ? new Date(s.expires_at).getTime() : undefined;
        const isMine = Boolean(s.is_mine);
        statuses[s.seat_id] = {
          status: s.status as 'locked' | 'booked',
          isMine,
          userId: isMine && callerId ? callerId : 'masked',
          ...(expTime ? { expiresAt: expTime } : {})
        };
      }
      return NextResponse.json({ statuses });
    }

    // 2. Read-only query fallback with strict in-memory masking (No direct table deletes)
    const nowMs = Date.now();
    const { data: seatLocks, error: selectError } = await supabase
      .from('seat_locks')
      .select('seat_id, user_id, status, expires_at')
      .eq('trip_id', tripId);

    if (selectError) {
      console.error("GET /api/seats/status error:", selectError);
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    const statuses: Record<string, { status: 'locked' | 'booked'; isMine: boolean; userId: string; expiresAt?: number }> = {};

    for (const lock of seatLocks || []) {
      const isMine = Boolean(callerId && lock.user_id === callerId);
      const safeUserId = isMine && callerId ? callerId : 'masked';

      if (lock.status === 'booked') {
        statuses[lock.seat_id] = {
          status: 'booked',
          isMine,
          userId: safeUserId
        };
      } else if (lock.status === 'locked' && lock.expires_at) {
        const expTime = new Date(lock.expires_at).getTime();
        // Only return if not yet expired
        if (expTime > nowMs) {
          statuses[lock.seat_id] = {
            status: 'locked',
            isMine,
            userId: safeUserId,
            expiresAt: expTime
          };
        }
      }
    }

    return NextResponse.json({ statuses });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to fetch seat statuses' }, { status });
  }
}
