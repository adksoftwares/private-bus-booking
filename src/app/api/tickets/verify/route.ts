import { NextResponse } from 'next/server';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookingId, staffUid, action = 'lookup' } = body;

    if (!bookingId || typeof bookingId !== 'string') {
      return NextResponse.json({ error: 'Valid bookingId is required' }, { status: 400 });
    }
    if (!staffUid || typeof staffUid !== 'string') {
      return NextResponse.json({ error: 'Authenticated staff ID is required' }, { status: 401 });
    }

    const db = getServerDatabase();

    // 1. Verify staff authorization
    const userSnap = await get(child(ref(db), `users/${staffUid}`));
    const ownerSnap = await get(child(ref(db), `owners/${staffUid}`));
    
    let isAuthorized = false;
    if (userSnap.exists()) {
      const role = userSnap.val().role;
      if (role === 'Admin' || role === 'Conductor' || role === 'Owner') {
        isAuthorized = true;
      }
    }
    if (ownerSnap.exists()) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Access denied. Authorized staff only.' }, { status: 403 });
    }

    // 2. Fetch booking
    let bookingSnap = await get(child(ref(db), `bookings/${bookingId}`));
    if (!bookingSnap.exists()) {
      bookingSnap = await get(child(ref(db), `tickets/${bookingId}`));
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Invalid Ticket — No booking found with this reference ID.'
      }, { status: 404 });
    }

    const booking = bookingSnap.val();

    // Fetch trip details for display
    let trip = null;
    if (booking.tripId) {
      const tripSnap = await get(child(ref(db), `trips/${booking.tripId}`));
      if (tripSnap.exists()) {
        trip = tripSnap.val();
      }
    }

    // 3. Status checks
    if (booking.status === 'cancelled') {
      return NextResponse.json({
        valid: false,
        reason: 'CANCELLED',
        message: 'Ticket Rejected — This booking was CANCELLED.',
        booking,
        trip
      });
    }

    if (booking.status === 'pending' || booking.status === 'payment_failed') {
      return NextResponse.json({
        valid: false,
        reason: 'UNPAID',
        message: 'Ticket Rejected — Payment has NOT been confirmed for this booking.',
        booking,
        trip
      });
    }

    // 4. Check for single-use boarding duplication
    if (booking.boarded || booking.status === 'boarded') {
      const boardedTime = booking.boardedAt ? new Date(booking.boardedAt).toLocaleTimeString() : 'Earlier';
      return NextResponse.json({
        valid: false,
        reason: 'ALREADY_BOARDED',
        message: `Ticket Already Used — This passenger was boarded at ${boardedTime}. Duplicate boarding is prohibited!`,
        boardedAt: booking.boardedAt,
        booking,
        trip
      });
    }

    // 5. If action is 'board', mark as boarded
    if (action === 'board') {
      const now = Date.now();
      const updates: Record<string, unknown> = {};
      updates[`bookings/${bookingId}/boarded`] = true;
      updates[`bookings/${bookingId}/boardedAt`] = now;
      updates[`bookings/${bookingId}/boardedBy`] = staffUid;
      updates[`bookings/${bookingId}/status`] = 'boarded';

      updates[`tickets/${bookingId}/boarded`] = true;
      updates[`tickets/${bookingId}/boardedAt`] = now;
      updates[`tickets/${bookingId}/boardedBy`] = staffUid;
      updates[`tickets/${bookingId}/status`] = 'boarded';

      await update(ref(db), updates);

      return NextResponse.json({
        valid: true,
        boarded: true,
        message: 'Passenger Boarded Successfully! Single-use boarding has been recorded.',
        booking: {
          ...booking,
          boarded: true,
          boardedAt: now,
          boardedBy: staffUid,
          status: 'boarded'
        },
        trip
      });
    }

    // Default 'lookup' response
    return NextResponse.json({
      valid: true,
      canBoard: true,
      message: 'Valid Confirmed Ticket — Ready for Boarding.',
      booking,
      trip
    });

  } catch (error: unknown) {
    console.error("Ticket verification error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
