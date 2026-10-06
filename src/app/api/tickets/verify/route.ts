import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireStaffOrAdmin } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { verifyTicketSchema, formatZodError } from '@/lib/validation/schemas';
import { atomicBoardTicket } from '@/lib/services/booking-service';

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
    const supabase = getSupabaseAdminClient();

    // 4. Resolve Booking by ID or Reference
    const { data: booking, error: findError } = await supabase
      .from('bookings')
      .select('*')
      .or(`id.eq.${cleanId},booking_reference.eq.${cleanId}`)
      .maybeSingle();

    if (findError || !booking) {
      return NextResponse.json({
        valid: false,
        reason: 'NOT_FOUND',
        message: 'Invalid Ticket — No booking record found for this reference.'
      }, { status: 404 });
    }

    // 5. If action is 'board', execute atomic single-use boarding transaction
    if (action === 'board') {
      const boardResult = await atomicBoardTicket(booking.id, staffUser);

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

        if (boardResult.reason === 'UNCONFIRMED') {
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
            boardedAt: boardResult.boardedAt
          }, { status: 409 });
        }

        return NextResponse.json({
          valid: false,
          reason: 'TRANSACTION_FAILED',
          message: 'Boarding transaction failed. Please retry.'
        }, { status: 500 });
      }

      // Fetch trip details for display
      const { data: tripData } = await supabase
        .from('trips')
        .select('*')
        .eq('id', booking.trip_id)
        .maybeSingle();

      const trip = tripData ? {
        id: tripData.id,
        routeSnapshot: tripData.route_snapshot,
        busSnapshot: tripData.bus_snapshot,
        departureDate: tripData.departure_date,
        departureTime: tripData.departure_time
      } : booking.trip_snapshot;

      return NextResponse.json({
        valid: true,
        canBoard: false,
        boarded: true,
        message: 'Boarding Confirmed — Passenger marked as boarded successfully.',
        booking: {
          id: booking.id,
          passengerName: booking.passenger_name,
          passengerPhone: booking.passenger_phone,
          seats: booking.seats,
          status: 'boarded',
          totalAmount: booking.total_amount
        },
        trip
      });
    }

    // 6. Action is 'lookup' (read-only verification check)
    // Fetch trip details for display
    const { data: tripData } = await supabase
      .from('trips')
      .select('*')
      .eq('id', booking.trip_id)
      .maybeSingle();

    const trip = tripData ? {
      id: tripData.id,
      routeSnapshot: tripData.route_snapshot,
      busSnapshot: tripData.bus_snapshot,
      departureDate: tripData.departure_date,
      departureTime: tripData.departure_time
    } : booking.trip_snapshot;

    const formattedBooking = {
      id: booking.id,
      passengerName: booking.passenger_name,
      passengerPhone: booking.passenger_phone,
      seats: booking.seats,
      status: booking.status,
      totalAmount: booking.total_amount
    };

    // Check status
    if (booking.status === 'cancelled') {
      return NextResponse.json({
        valid: false,
        reason: 'CANCELLED',
        message: 'Ticket Rejected — This booking was CANCELLED.',
        booking: formattedBooking,
        trip
      });
    }

    if (booking.status === 'pending' || booking.status === 'payment_failed') {
      return NextResponse.json({
        valid: false,
        reason: 'UNPAID',
        message: 'Ticket Rejected — Payment has NOT been confirmed for this booking.',
        booking: formattedBooking,
        trip
      });
    }

    if (booking.boarded || booking.status === 'boarded') {
      const boardedTime = booking.boarded_at ? new Date(booking.boarded_at).toLocaleTimeString() : 'Earlier';
      return NextResponse.json({
        valid: false,
        reason: 'ALREADY_BOARDED',
        message: `Ticket Already Used — This passenger was boarded at ${boardedTime}. Duplicate boarding is prohibited!`,
        boardedAt: booking.boarded_at ? new Date(booking.boarded_at).getTime() : undefined,
        booking: formattedBooking,
        trip
      });
    }

    // Valid ticket ready for boarding
    return NextResponse.json({
      valid: true,
      canBoard: true,
      boarded: false,
      message: 'Valid Ticket — Passenger is cleared for boarding.',
      booking: formattedBooking,
      trip
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
