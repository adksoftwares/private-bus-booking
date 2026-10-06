import { NextResponse } from 'next/server';
import { getAuthenticatedUser, HttpError } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { lookupBookingSchema } from '@/lib/validation/schemas';
import { lookupBookingByReference } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting against enumeration and brute force (30 requests / minute)
    enforceRateLimit(req, 'lookup-booking', 30, 60);

    const body = await req.json();
    const { reference, phone, accessToken } = lookupBookingSchema.parse(body);

    const authenticatedUser = await getAuthenticatedUser(req);

    // 2. Delegate lookup and authorization to domain service
    const { booking, trip } = await lookupBookingByReference(
      reference,
      accessToken,
      authenticatedUser?.uid,
      phone
    );

    return NextResponse.json({
      success: true,
      booking,
      trip
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
    console.error("Booking lookup error:", error);
    return NextResponse.json({ error: 'Failed to look up booking. Please try again.' }, { status: 500 });
  }
}
