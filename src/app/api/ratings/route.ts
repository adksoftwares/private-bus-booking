import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { submitBusRatingSchema, formatZodError } from '@/lib/validation/schemas';
import { Booking } from '@/types/booking';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting
    await enforceRateLimit(req, 'submit_rating', 10, 60);

    // 2. Validate request payload
    const body = await req.json();
    const parseResult = submitBusRatingSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { busId, bookingId, rating, review } = parseResult.data;
    const db = getAdminDatabase();

    // 3. Optional user auth
    const authUser = await getAuthenticatedUser(req);

    // 4. Verify booking eligibility (must be a completed/confirmed booking for this bus)
    let bookingSnap = await db.ref(`bookings/${bookingId}`).once('value');
    if (!bookingSnap.exists()) {
      bookingSnap = await db.ref(`tickets/${bookingId}`).once('value');
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Valid booking reference is required to submit a rating.' }, { status: 404 });
    }

    const booking: Booking = bookingSnap.val();

    // Verify booking is confirmed or boarded
    if (booking.status !== 'confirmed' && booking.status !== 'boarded') {
      return NextResponse.json({ error: 'Only confirmed or completed journeys can be reviewed.' }, { status: 400 });
    }

    // Verify ownership
    if (authUser) {
      if (booking.userId && booking.userId !== authUser.uid) {
        return NextResponse.json({ error: 'You can only rate trips booked under your account.' }, { status: 403 });
      }
    } else {
      // For guest, check accessToken if provided in body
      if (body.accessToken && booking.accessToken && body.accessToken !== booking.accessToken) {
        return NextResponse.json({ error: 'Invalid access token for this booking.' }, { status: 403 });
      }
    }

    // 5. Check if this booking was already reviewed
    const existingReviewSnap = await db.ref(`busReviews/${busId}/${bookingId}`).once('value');
    if (existingReviewSnap.exists()) {
      return NextResponse.json({ error: 'You have already submitted a review for this journey.' }, { status: 409 });
    }

    // 6. Record review
    const now = Date.now();
    const reviewRecord = {
      bookingId,
      busId,
      rating,
      review: review?.trim() || '',
      passengerName: booking.passengerName ? `${booking.passengerName[0]}***` : 'Verified Passenger',
      createdAt: now
    };

    // 7. Atomic transaction on Bus to update rating stats
    const busRef = db.ref(`buses/${busId}`);
    const busResult = await busRef.transaction((currentBus) => {
      if (!currentBus) return;

      const currentCount = currentBus.ratingCount || 0;
      const currentAvg = currentBus.rating || 5.0;

      const newCount = currentCount + 1;
      const newAvg = Number(((currentAvg * currentCount + rating) / newCount).toFixed(1));

      currentBus.rating = newAvg;
      currentBus.ratingCount = newCount;
      currentBus.updatedAt = now;

      return currentBus;
    });

    if (!busResult.committed) {
      return NextResponse.json({ error: 'Bus not found or update conflict.' }, { status: 404 });
    }

    // Save review record
    await db.ref(`busReviews/${busId}/${bookingId}`).set(reviewRecord);

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your verified bus rating has been submitted.',
      rating: busResult.snapshot.val().rating,
      ratingCount: busResult.snapshot.val().ratingCount
    });

  } catch (error: unknown) {
    console.error("Submit rating error:", error);
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to submit rating' }, { status });
  }
}
