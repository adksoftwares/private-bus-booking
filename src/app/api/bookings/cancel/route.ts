import { NextResponse } from 'next/server';
import { getAuthenticatedUser, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { cancelBookingSchema } from '@/lib/validation/schemas';
import { cancelBooking } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    // 1. Abuse & Brute-Force Rate Limiting
    enforceRateLimit(req, 'cancel-booking', 15, 60);

    const body = await req.json();
    const { bookingId, accessToken } = cancelBookingSchema.parse(body);

    // 2. Identify caller (if signed in)
    const user = await getAuthenticatedUser(req);

    // 3. Delegate to authoritative domain service
    // Enforces cryptographic accessToken OR verified authenticated user ownership
    // Rejects phone-only cancellation to prevent unauthorized ticket cancellations
    const result = await cancelBooking(bookingId, user, accessToken);

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
