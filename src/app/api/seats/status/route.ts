import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');
    // Never trust caller-supplied sessionId/userId for ownership decisions.
    // Only a server-verified authenticated user may be marked as the owner of a lock.

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);
    const callerId = user?.uid || null;

    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // 1. Try PostgreSQL RPC get_trip_seat_availability first (safe masked query)
    try {
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
    } catch {
      // Fall back to direct query
    }

    // 2. Direct query fallback with strict privacy masking
    await supabase
      .from('seat_locks')
      .delete()
      .eq('trip_id', tripId)
      .eq('status', 'locked')
      .lt('expires_at', nowIso);

    const { data: seatLocks, error } = await supabase
      .from('seat_locks')
      .select('seat_id, user_id, status, expires_at')
      .eq('trip_id', tripId);

    if (error) {
      console.error("GET /api/seats/status error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to fetch seat statuses' }, { status: 500 });
  }
}
