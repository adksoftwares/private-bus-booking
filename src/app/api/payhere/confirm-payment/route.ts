import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { lookupBookingByReference } from '@/lib/services/booking-service';
import { invalidateTripSeatsCache } from '@/app/api/seats/status/route';
import { Json } from '@/types/database';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'confirm_payment', 30, 60);

    const body = await req.json();
    const { orderId, accessToken } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Valid orderId is required' }, { status: 400 });
    }

    const authUser = await getAuthenticatedUser(req);

    // 1. Fetch authoritative booking and verify authorization via secure atomic lookup
    let booking;
    try {
      const result = await lookupBookingByReference(orderId, accessToken, authUser?.uid);
      booking = result.booking;
    } catch (lookupErr: unknown) {
      const err = lookupErr as { statusCode?: number; message?: string };
      const status = err.statusCode || 404;
      return NextResponse.json({ error: err.message || 'Booking not found for orderId' }, { status });
    }

    // 2. Idempotent check
    if (booking.status === 'confirmed') {
      return NextResponse.json({ success: true, status: 'confirmed', message: 'Booking already confirmed' });
    }

    if (booking.status !== 'pending') {
      return NextResponse.json({ error: `Cannot confirm booking in '${booking.status}' status.` }, { status: 400 });
    }

    // 3. Atomically confirm booking and transition seat locks to 'booked'
    const supabase = getSupabaseAdminClient();
    const paymentId = `PAY-SANDBOX-${Date.now()}`;

    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_payment_webhook_atomic', {
      p_order_id: booking.id,
      p_payment_id: paymentId,
      p_amount: Number(booking.totalAmount),
      p_currency: 'LKR',
      p_status_code: '2', // 2 = Approved/Success in PayHere
      p_raw_payload: { confirmedVia: 'payhere_on_completed_sdk', timestamp: new Date().toISOString() } as unknown as Json
    });

    if (rpcError) {
      console.error('Payment confirmation error:', rpcError);
      return NextResponse.json({ error: 'Failed to confirm booking payment.' }, { status: 500 });
    }

    // 4. Invalidate seat status cache so seat map immediately updates
    invalidateTripSeatsCache(booking.tripId);

    return NextResponse.json({
      success: true,
      status: 'confirmed',
      orderId: booking.id,
      paymentId,
      rpcResult
    });

  } catch (error: unknown) {
    console.error('Confirm payment route error:', error);
    const err = error as { statusCode?: number; message?: string };
    return NextResponse.json({ error: err.message || 'Internal server error confirming payment.' }, { status: err.statusCode || 500 });
  }
}
