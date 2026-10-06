import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { requireStaffOrAdmin } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { verifyTicketSchema, formatZodError } from '@/lib/validation/schemas';
import { atomicBoardTicket } from '@/lib/services/booking-service';
import { Booking } from '@/types/booking';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting
    await enforceRateLimit(req, 'verify_ticket', 60, 60);

    // 2. Server-verified Authentication (Bearer token verified, no client staffUid spoofing)
    const staffUser = await requireStaffOrAdmin(req);

    // 3. Validate request payload
    const body = await req.json();
    const parseResult = verifyTicketSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { bookingId: rawId, action } = parseResult.data;
    const cleanId = rawId.trim();
    const db = getAdminDatabase();

    // 4. Resolve Order ID from Reference if needed (e.g. "SLB-AB12CD")
    let orderId = cleanId;
    if (cleanId.toUpperCase().startsWith('SLB-')) {
      const refSnap = await db.ref(`indexes/bookingReferences/${cleanId.toUpperCase()}`).once('value');
      if (refSnap.exists()) {
        orderId = refSnap.val();
      }
    }

    // 5. If action is 'board', execute atomic single-use boarding transaction
    if (action === 'board') {
      const boardResult = await atomicBoardTicket(orderId, staffUser);

      if (!boardResult.success) {
        if (boardResult.reason === 'NOT_FOUND') {
          return NextResponse.json({
            valid: false,
            reason: 'NOT_FOUND',
            message: 'Invalid Ticket — No booking record found for this reference.'
          }, { status: 404 });
        }

        if (boardResult.reason === 'CANCELLED') {
          return NextResponse.json({
            valid: false,
            reason: 'CANCELLED',
            message: 'Boarding Rejected — This booking was CANCELLED.'
          }, { status: 400 });
        }

        if (boardResult.reason === 'UNPAID') {
          return NextResponse.json({
            valid: false,
            reason: 'UNPAID',
            message: 'Boarding Rejected — Ticket payment is not confirmed.'
          }, { status: 400 });
        }

        if (boardResult.reason === 'ALREADY_BOARDED') {
          const boardedTime = boardResult.boardedAt ? new Date(boardResult.boardedAt).toLocaleTimeString() : 'Earlier';
          return NextResponse.json({
            valid: false,
            reason: 'ALREADY_BOARDED',
            message: `Ticket Already Used — This passenger was already boarded at ${boardedTime}. Duplicate boarding is rejected!`,
            boardedAt: boardResult.boardedAt,
            boardedBy: boardResult.boardedBy
          }, { status: 409 });
        }

        return NextResponse.json({
          valid: false,
          reason: 'TRANSACTION_FAILED',
          message: 'Boarding transaction failed. Please retry.'
        }, { status: 500 });
      }

      // Fetch trip details for display
      let trip = null;
      if (boardResult.booking?.tripId) {
        const tripSnap = await db.ref(`trips/${boardResult.booking.tripId}`).once('value');
        if (tripSnap.exists()) {
          trip = tripSnap.val();
        }
      }

      return NextResponse.json({
        valid: true,
        canBoard: false,
        boarded: true,
        message: 'Boarding Confirmed — Passenger marked as boarded successfully.',
        booking: boardResult.booking,
        trip
      });
    }

    // 6. Action is 'lookup' (read-only verification check)
    let bookingSnap = await db.ref(`bookings/${orderId}`).once('value');
    if (!bookingSnap.exists()) {
      bookingSnap = await db.ref(`tickets/${orderId}`).once('value');
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Invalid Ticket — No booking found with this reference ID.'
      }, { status: 404 });
    }

    const booking: Booking = bookingSnap.val();

    // Fetch trip details for display
    let trip = null;
    if (booking.tripId) {
      const tripSnap = await db.ref(`trips/${booking.tripId}`).once('value');
      if (tripSnap.exists()) {
        trip = tripSnap.val();
      }
    }

    // Check status
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

    // Valid ticket ready for boarding
    return NextResponse.json({
      valid: true,
      canBoard: true,
      boarded: false,
      message: 'Valid Ticket — Passenger is cleared for boarding.',
      booking,
      trip
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
