import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { Booking } from '@/types/booking';

export async function GET(req: Request) {
  try {
    enforceRateLimit(req, 'user_bookings', 30, 60);
    const user = await requireAuth(req);
    const supabase = getSupabaseAdminClient();

    const { data: bookingsData, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', user.uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("GET /api/bookings/user error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const bookings: Booking[] = (bookingsData || []).map(b => ({
      id: b.id,
      bookingReference: b.booking_reference,
      accessToken: '', // Token minimization: Do not leak access tokens in bulk lists
      bookingType: b.booking_type,
      tripId: b.trip_id,
      userId: b.user_id,
      ownerId: b.owner_id,
      passengerName: b.passenger_name,
      passengerPhone: b.passenger_phone,
      passengerEmail: b.passenger_email || undefined,
      passengerDetails: (b.passenger_details as unknown) as Booking['passengerDetails'],
      seats: b.seats,
      totalAmount: Number(b.total_amount),
      fares: (b.fares as unknown) as Booking['fares'],
      status: b.status,
      boarded: b.boarded,
      boardedAt: b.boarded_at ? new Date(b.boarded_at).getTime() : undefined,
      boardedBy: b.boarded_by || undefined,
      paymentId: b.payment_id || undefined,
      refundId: b.refund_id || undefined,
      tripSnapshot: (b.trip_snapshot as unknown) as Booking['tripSnapshot'],
      createdAt: new Date(b.created_at).getTime(),
      updatedAt: b.updated_at ? new Date(b.updated_at).getTime() : undefined,
      cancelledAt: b.cancelled_at ? new Date(b.cancelled_at).getTime() : undefined
    }));

    return NextResponse.json({ bookings });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status });
  }
}
