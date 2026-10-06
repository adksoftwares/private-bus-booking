import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { cancelBookingSchema } from '@/lib/validation/schemas';
import { normalizeSriLankanPhone } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'cancel-booking', 15, 60);

    const body = await req.json();
    const { bookingId, accessToken, phone } = cancelBookingSchema.parse(body);

    const supabase = getSupabaseAdminClient();
    const { data: booking, error: findError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (findError || !booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'This booking has already been cancelled.' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req);

    // Authorization checks:
    let isAuthorized = false;

    if (user) {
      if (user.isAdmin) {
        isAuthorized = true;
      } else if (booking.user_id && booking.user_id === user.uid) {
        isAuthorized = true;
      } else if (booking.owner_id && booking.owner_id === user.uid) {
        isAuthorized = true;
      }
    }

    // Guest authorization via cryptographic access token
    if (!isAuthorized && accessToken && booking.access_token && booking.access_token === accessToken) {
      isAuthorized = true;
    }

    // Guest authorization via verified phone
    if (!isAuthorized && phone) {
      const cleanReq = normalizeSriLankanPhone(phone);
      const cleanBooking = normalizeSriLankanPhone(booking.passenger_phone || '');
      if (cleanReq && cleanBooking && cleanReq === cleanBooking) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only cancel your own bookings.' },
        { status: 403 }
      );
    }

    // Compute refund tier based on trip departure time
    const tripSnapshot = booking.trip_snapshot as Record<string, unknown>;
    const departureDate = tripSnapshot?.departureDate as string;
    const departureTime = tripSnapshot?.departureTime as string;

    let refundPercentage = 0;
    if (departureDate && departureTime) {
      const departureDateTime = new Date(`${departureDate}T${departureTime}:00`);
      const diffHours = (departureDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

      if (diffHours > 24) refundPercentage = 100;
      else if (diffHours >= 12) refundPercentage = 50;
      else refundPercentage = 0;
    }

    const fares = booking.fares as Record<string, unknown>;
    const originalTicketAmount = Number(fares?.ticketAmount || booking.total_amount || 0);
    const refundAmount = Math.round(((originalTicketAmount * refundPercentage) / 100) * 100) / 100;
    const refundId = `RF-${Date.now()}`;

    // 1. Update booking status
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        refund_id: refundId,
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', bookingId);

    // 2. Insert refund record
    await supabase
      .from('refunds')
      .insert([{
        id: refundId,
        booking_id: bookingId,
        user_id: user?.uid || booking.user_id || 'guest',
        original_amount: originalTicketAmount,
        refund_amount: refundAmount,
        refund_percentage: refundPercentage,
        status: refundAmount > 0 ? 'pending_payout' : 'no_refund',
        created_at: new Date().toISOString()
      }]);

    // 3. Free up seats
    if (booking.seats && Array.isArray(booking.seats)) {
      await supabase
        .from('seat_locks')
        .delete()
        .eq('trip_id', booking.trip_id)
        .in('seat_id', booking.seats);
    }

    return NextResponse.json({
      success: true,
      refundPercentage,
      refundAmount,
      message: refundAmount > 0
        ? `Booking cancelled successfully. You are eligible for a ${refundPercentage}% refund (Rs. ${refundAmount.toFixed(2)}).`
        : 'Booking cancelled successfully. No refund is available within 12 hours of departure.'
    });

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodErr = error as { issues: Array<{ message: string }> };
      return NextResponse.json(
        { error: zodErr.issues[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }
    console.error("Booking cancellation error:", error);
    return NextResponse.json({ error: 'Failed to process cancellation. Please try again.' }, { status: 500 });
  }
}
