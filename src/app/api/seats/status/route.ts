import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';

// High-performance in-memory cache for trip seat statuses
interface CachedTripSeats {
  locks: Array<{ seat_id: string; user_id: string; status: string; expires_at: string | null }>;
  cachedAt: number;
}
const tripSeatsMemoryCache = new Map<string, CachedTripSeats>();
const SEATS_CACHE_TTL_MS = 15000; // 15s TTL (invalidated explicitly on lock/unlock/booking)

export function invalidateTripSeatsCache(tripId?: string) {
  if (tripId) {
    tripSeatsMemoryCache.delete(tripId);
  } else {
    tripSeatsMemoryCache.clear();
  }
}

export async function GET(req: Request) {
  try {
    enforceRateLimit(req, 'seat_status', 60, 60);

    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get('tripId');
    const sessionId = searchParams.get('sessionId') || searchParams.get('userId');

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 });
    }

    let callerId = sessionId || null;
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const user = await getAuthenticatedUser(req);
      if (user?.uid) callerId = user.uid;
    }

    const nowMs = Date.now();
    const cached = tripSeatsMemoryCache.get(tripId);

    // If cache is fresh, build response in 0ms without hitting remote database
    if (cached && (nowMs - cached.cachedAt) < SEATS_CACHE_TTL_MS) {
      const statuses: Record<string, { status: 'locked' | 'booked'; isMine: boolean; userId: string; expiresAt?: number }> = {};
      for (const lock of cached.locks) {
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
      return NextResponse.json({ statuses }, { headers: { 'X-Cache': 'HIT' } });
    }

    const supabase = getSupabaseAdminClient();

    // Query seat_locks with fast indexed lookup
    const { data: seatLocks, error: selectError } = await supabase
      .from('seat_locks')
      .select('seat_id, user_id, status, expires_at')
      .eq('trip_id', tripId);

    if (selectError) {
      console.error("GET /api/seats/status error:", selectError);
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    // Save to memory cache
    const validLocks = seatLocks || [];
    tripSeatsMemoryCache.set(tripId, {
      locks: validLocks,
      cachedAt: nowMs
    });

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
