import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // 1. Clean up expired locks first
    await supabase
      .from('seat_locks')
      .delete()
      .eq('trip_id', tripId)
      .eq('status', 'locked')
      .lt('expires_at', nowIso);

    // 2. Fetch all active locks and booked seats for this trip
    const { data: seatLocks, error } = await supabase
      .from('seat_locks')
      .select('seat_id, user_id, status, expires_at')
      .eq('trip_id', tripId);

    if (error) {
      console.error("GET /api/seats/status error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const statuses: Record<string, { status: 'locked' | 'booked'; userId: string; expiresAt?: number }> = {};

    for (const lock of seatLocks || []) {
      if (lock.status === 'booked') {
        statuses[lock.seat_id] = {
          status: 'booked',
          userId: lock.user_id
        };
      } else if (lock.status === 'locked' && lock.expires_at) {
        const expTime = new Date(lock.expires_at).getTime();
        if (expTime > nowMs) {
          statuses[lock.seat_id] = {
            status: 'locked',
            userId: lock.user_id,
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
