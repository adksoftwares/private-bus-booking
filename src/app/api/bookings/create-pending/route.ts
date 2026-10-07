import { NextResponse } from 'next/server';
import { getAuthenticatedUser, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { createPendingBookingSchema } from '@/lib/validation/schemas';
import { createPendingBooking } from '@/lib/services/booking-service';
import { invalidateTripSeatsCache } from '@/app/api/seats/status/route';

export async function POST(req: Request) {
  try {
    // 1. Abuse & Brute-Force Rate Limiting
    enforceRateLimit(req, 'create-pending', 20, 60);

    // 2. Validate input schema
    const body = await req.json();
    const validatedData = createPendingBookingSchema.parse(body);

    // 3. Authenticate caller server-side (anti-spoofing)
    const authenticatedUser = await getAuthenticatedUser(req);

    // 4. Create pending booking via authoritative domain service
    const booking = await createPendingBooking({
      tripId: validatedData.tripId,
      selectedSeats: validatedData.selectedSeats,
      passengerDetails: validatedData.passengerDetails,
      authenticatedUser,
      guestSessionId: validatedData.guestSessionId
    });

    invalidateTripSeatsCache(validatedData.tripId);

    return NextResponse.json({
      success: true,
      orderId: booking.id,
      bookingReference: booking.bookingReference,
      accessToken: booking.accessToken,
      bookingType: booking.bookingType,
      amount: booking.totalAmount,
      booking
    });

  } catch (error: unknown) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error && typeof error === 'object' && 'issues' in error) {
      // Zod validation error
      const zodErr = error as { issues: Array<{ message: string }> };
      return NextResponse.json(
        { error: zodErr.issues[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }
    console.error("Create pending booking error:", error);
    return NextResponse.json({ error: 'Failed to create reservation. Please try again.' }, { status: 500 });
  }
}
