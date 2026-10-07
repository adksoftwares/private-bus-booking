import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { atomicLockSeats } from '@/lib/services/booking-service';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'seat-lock', 60, 60);

    const body = await req.json();
    const { tripId, seatId, seatIds, guestSessionId } = body;

    if (!tripId || (!seatId && (!seatIds || seatIds.length === 0))) {
      return NextResponse.json({ error: 'tripId and seatId(s) are required' }, { status: 400 });
    }

    const seatsToLock: string[] = seatIds || [seatId];
    let effectiveUserId = guestSessionId || 'anonymous_guest';
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const user = await getAuthenticatedUser(req);
      if (user?.uid) effectiveUserId = user.uid;
    }

    const lockResult = await atomicLockSeats(tripId, seatsToLock, effectiveUserId);

    if (!lockResult.success) {
      return NextResponse.json({
        success: false,
        conflictingSeat: lockResult.conflictingSeat,
        message: `Seat ${lockResult.conflictingSeat} is no longer available.`
      }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      lockedSeats: seatsToLock
    });

  } catch (error: unknown) {
    console.error("Seat lock error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to lock seat' }, { status: 500 });
  }
}
