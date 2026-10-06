import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { submitBusRatingSchema, formatZodError } from '@/lib/validation/schemas';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const busId = searchParams.get('busId');

    const supabase = getSupabaseAdminClient();

    if (busId) {
      const { data: reviews, error } = await supabase
        .from('bus_reviews')
        .select('*')
        .eq('bus_id', busId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const count = reviews.length;
      const avg = count > 0 
        ? Number((reviews.reduce((acc, r) => acc + r.rating, 0) / count).toFixed(1))
        : 5.0;

      return NextResponse.json({
        busId,
        rating: avg,
        ratingCount: count,
        reviews
      });
    }

    // Return all bus ratings
    const { data: allReviews, error } = await supabase
      .from('bus_reviews')
      .select('bus_id, rating');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ratingsMap: Record<string, { rating: number; count: number }> = {};
    for (const r of allReviews || []) {
      if (!ratingsMap[r.bus_id]) {
        ratingsMap[r.bus_id] = { rating: 0, count: 0 };
      }
      ratingsMap[r.bus_id].rating += r.rating;
      ratingsMap[r.bus_id].count += 1;
    }

    const result: Record<string, { rating: number; count: number }> = {};
    for (const [bId, data] of Object.entries(ratingsMap)) {
      result[bId] = {
        rating: Number((data.rating / data.count).toFixed(1)),
        count: data.count
      };
    }

    return NextResponse.json({ ratings: result });

  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to fetch ratings' }, { status: 500 });
  }
}

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
    const supabase = getSupabaseAdminClient();

    // 3. Optional user auth
    const authUser = await getAuthenticatedUser(req);

    // 4. Verify booking eligibility (must be a completed/confirmed booking for this bus)
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Valid booking reference is required to submit a rating.' }, { status: 404 });
    }

    // Verify booking is confirmed or boarded
    if (booking.status !== 'confirmed' && booking.status !== 'boarded') {
      return NextResponse.json({ error: 'Only confirmed or completed journeys can be reviewed.' }, { status: 400 });
    }

    // Authorization is based on the booking itself, never merely on whether the
    // caller happens to be authenticated. Guest bookings still require their
    // cryptographic access token even when the caller is signed in.
    if (booking.user_id) {
      if (!authUser || booking.user_id !== authUser.uid) {
        return NextResponse.json({ error: 'You can only rate trips booked under your account.' }, { status: 403 });
      }
    } else {
      if (!body.accessToken || !booking.access_token || body.accessToken !== booking.access_token) {
        return NextResponse.json({ error: 'Valid booking access token is required to submit a verified review.' }, { status: 403 });
      }
    }

    // Resolve the bus from the authoritative trip row. Do not trust a mutable
    // booking snapshot or a client-supplied bus relationship for authorization.
    const { data: tripRecord, error: tripLookupError } = await supabase
      .from('trips')
      .select('bus_id')
      .eq('id', booking.trip_id)
      .maybeSingle();

    if (tripLookupError || !tripRecord || tripRecord.bus_id !== busId) {
      return NextResponse.json({ error: 'This booking was for a different bus.' }, { status: 400 });
    }

    // 5. Check if this booking was already reviewed
    const { data: existingReview } = await supabase
      .from('bus_reviews')
      .select('id')
      .eq('bus_id', busId)
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existingReview) {
      return NextResponse.json({ error: 'You have already submitted a review for this journey.' }, { status: 409 });
    }

    // 6. Record review in PostgreSQL
    const passengerName = booking.passenger_name ? `${booking.passenger_name[0]}***` : 'Verified Passenger';

    const { error: insertReviewError } = await supabase
      .from('bus_reviews')
      .insert([{
        bus_id: busId,
        booking_id: bookingId,
        user_id: authUser ? authUser.uid : null,
        passenger_name: passengerName,
        rating,
        comment: review?.trim() || null,
        created_at: new Date().toISOString()
      }]);

    if (insertReviewError) {
      console.error("Failed to insert review:", insertReviewError);
      return NextResponse.json({ error: 'Failed to record review.' }, { status: 500 });
    }

    // 7. Calculate new aggregate rating for bus
    const { data: busReviews } = await supabase
      .from('bus_reviews')
      .select('rating')
      .eq('bus_id', busId);

    const totalReviews = busReviews ? busReviews.length : 1;
    const avgRating = busReviews && busReviews.length > 0
      ? Number((busReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(1))
      : rating;

    return NextResponse.json({
      success: true,
      message: 'Thank you! Your verified bus rating has been submitted.',
      rating: avgRating,
      ratingCount: totalReviews
    });

  } catch (error: unknown) {
    console.error("Submit rating error:", error);
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to submit rating' }, { status });
  }
}
