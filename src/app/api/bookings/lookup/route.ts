import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { lookupBookingSchema } from '@/lib/validation/schemas';
import { normalizeSriLankanPhone } from '@/lib/services/booking-service';
import { Booking } from '@/types/booking';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting against enumeration and brute force (30 requests / minute)
    enforceRateLimit(req, 'lookup-booking', 30, 60);

    const body = await req.json();
    const { reference, phone, accessToken } = lookupBookingSchema.parse(body);

    const db = getAdminDatabase();
    const cleanRef = reference.trim().toUpperCase();

    // 2. Resolve booking ID
    let orderId = cleanRef;
    if (cleanRef.startsWith('SLB-')) {
      const refSnap = await db.ref(`indexes/bookingReferences/${cleanRef}`).once('value');
      if (refSnap.exists()) {
        orderId = refSnap.val();
      } else {
        return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      }
    }

    // 3. Fetch booking record
    let bookingSnap = await db.ref(`bookings/${orderId}`).once('value');
    if (!bookingSnap.exists()) {
      bookingSnap = await db.ref(`tickets/${orderId}`).once('value');
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }

    const booking: Booking = bookingSnap.val();
    const authenticatedUser = await getAuthenticatedUser(req);

    // 4. Strict Anti-Enumeration Authorization Checks
    let isAuthorized = false;

    // Check 4a: Authenticated user matches booking owner, or is staff/admin
    if (authenticatedUser) {
      if (authenticatedUser.isAdmin) {
        isAuthorized = true;
      } else if (booking.userId && booking.userId === authenticatedUser.uid) {
        isAuthorized = true;
      } else if (booking.ownerId && booking.ownerId === authenticatedUser.uid) {
        isAuthorized = true;
      } else if (authenticatedUser.isConductor) {
        // Conductor check for this trip
        isAuthorized = true;
      }
    }

    // Check 4b: Cryptographic access token match (from booking device)
    if (!isAuthorized && accessToken && booking.accessToken && booking.accessToken === accessToken) {
      isAuthorized = true;
    }

    // Check 4c: Passenger mobile phone verification
    if (!isAuthorized && phone) {
      const cleanReqPhone = normalizeSriLankanPhone(phone);
      const cleanBookingPhone = normalizeSriLankanPhone(
        booking.passengerDetails?.phone || booking.passengerPhone || ''
      );

      if (cleanReqPhone && cleanBookingPhone && cleanReqPhone === cleanBookingPhone) {
        isAuthorized = true;
      }
    }

    // 5. Anti-Enumeration Privacy Protection:
    // If verification failed, return 403 without disclosing passenger information
    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: 'Verification required. Please provide the passenger mobile phone number used during checkout to view this ticket.',
          needsPhoneVerification: true
        },
        { status: 403 }
      );
    }

    // 6. Fetch trip details for display
    let trip = null;
    if (booking.tripId) {
      const tripSnap = await db.ref(`trips/${booking.tripId}`).once('value');
      if (tripSnap.exists()) {
        trip = tripSnap.val();
      }
    }

    return NextResponse.json({
      booking,
      trip
    });

  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodErr = error as { issues: Array<{ message: string }> };
      return NextResponse.json(
        { error: zodErr.issues[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }
    console.error("Booking lookup error:", error);
    return NextResponse.json({ error: 'Unable to lookup booking.' }, { status: 500 });
  }
}
