import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { getAuthenticatedUser, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { cancelBookingSchema } from '@/lib/validation/schemas';
import { cancelBookingWithRefund, normalizeSriLankanPhone } from '@/lib/services/booking-service';
import { Booking } from '@/types/booking';

export async function POST(req: Request) {
  try {
    enforceRateLimit(req, 'cancel-booking', 15, 60);

    const body = await req.json();
    const { bookingId, accessToken, phone } = cancelBookingSchema.parse(body);

    const db = getAdminDatabase();
    const bookingSnap = await db.ref(`bookings/${bookingId}`).once('value');

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    const booking: Booking = bookingSnap.val();
    const user = await getAuthenticatedUser(req);

    // Authorization checks:
    let isAuthorized = false;

    if (user) {
      if (user.isAdmin) {
        isAuthorized = true;
      } else if (booking.userId && booking.userId === user.uid) {
        isAuthorized = true;
      } else if (booking.ownerId && booking.ownerId === user.uid) {
        isAuthorized = true;
      }
    }

    // Guest authorization via cryptographic access token
    if (!isAuthorized && accessToken && booking.accessToken && booking.accessToken === accessToken) {
      isAuthorized = true;
    }

    // Guest authorization via verified phone
    if (!isAuthorized && phone) {
      const cleanReq = normalizeSriLankanPhone(phone);
      const cleanBooking = normalizeSriLankanPhone(booking.passengerDetails?.phone || booking.passengerPhone || '');
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

    const result = await cancelBookingWithRefund(bookingId, user ? user.uid : null);
    return NextResponse.json(result);

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
