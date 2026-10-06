import { NextResponse } from 'next/server';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';
import { Booking } from '@/types/booking';

function normalizePhone(p: string): string {
  if (!p) return '';
  const digits = p.replace(/[^0-9]/g, '');
  if (digits.startsWith('94') && digits.length === 11) {
    return '0' + digits.substring(2);
  }
  return digits;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reference, userId, accessToken, phone } = body;

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Valid booking reference or ID is required' }, { status: 400 });
    }
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Authenticated userId is required' }, { status: 401 });
    }

    const cleanRef = reference.trim();
    const db = getServerDatabase();

    // 1. Resolve Order ID from Reference
    let orderId = cleanRef;
    if (cleanRef.toUpperCase().startsWith('SLB-')) {
      const refSnap = await get(child(ref(db), `indexes/bookingReferences/${cleanRef.toUpperCase()}`));
      if (refSnap.exists()) {
        orderId = refSnap.val();
      }
    }

    // 2. Fetch booking
    let bookingSnap = await get(child(ref(db), `bookings/${orderId}`));
    if (!bookingSnap.exists()) {
      bookingSnap = await get(child(ref(db), `tickets/${orderId}`));
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found. Please verify the booking reference.' }, { status: 404 });
    }

    const booking = bookingSnap.val() as Booking;

    // 3. Verify that booking is not already claimed by a different account
    if (booking.userId) {
      if (booking.userId === userId) {
        return NextResponse.json({
          success: true,
          message: 'This booking is already associated with your account.',
          booking
        });
      } else {
        return NextResponse.json({
          error: 'This booking is already linked to another registered account and cannot be claimed.'
        }, { status: 403 });
      }
    }

    // 4. Fetch the authenticated user's profile to verify matching identity
    const userSnap = await get(child(ref(db), `users/${userId}`));
    const userData = userSnap.exists() ? userSnap.val() : {};
    const userPhone = userData.phone || userData.mobile || phone || '';
    const userEmail = userData.email || '';

    // Verify ownership proof
    let isVerified = false;

    // Check token match
    if (accessToken && booking.accessToken && booking.accessToken === accessToken) {
      isVerified = true;
    }

    // Check phone match
    if (userPhone && booking.passengerPhone) {
      const uPhoneNorm = normalizePhone(userPhone);
      const bPhoneNorm = normalizePhone(booking.passengerPhone);
      if (uPhoneNorm && bPhoneNorm && (uPhoneNorm === bPhoneNorm || bPhoneNorm.endsWith(uPhoneNorm) || uPhoneNorm.endsWith(bPhoneNorm))) {
        isVerified = true;
      }
    }

    // Check email match
    if (userEmail && booking.passengerEmail) {
      if (userEmail.toLowerCase().trim() === booking.passengerEmail.toLowerCase().trim()) {
        isVerified = true;
      }
    }

    if (!isVerified) {
      return NextResponse.json({
        error: 'Verification failed. To link a guest booking, the passenger phone number or email must match your account credentials.'
      }, { status: 403 });
    }

    // 5. Update booking and index under user's account
    const now = Date.now();
    const updates: Record<string, unknown> = {};

    updates[`bookings/${orderId}/userId`] = userId;
    updates[`bookings/${orderId}/bookingType`] = 'account';
    updates[`bookings/${orderId}/passengerDetails/uid`] = userId;
    updates[`bookings/${orderId}/updatedAt`] = now;

    updates[`tickets/${orderId}/userId`] = userId;
    updates[`tickets/${orderId}/bookingType`] = 'account';
    updates[`tickets/${orderId}/updatedAt`] = now;

    updates[`indexes/userBookings/${userId}/${orderId}`] = true;

    await update(ref(db), updates);

    const updatedBooking: Booking = {
      ...booking,
      userId,
      bookingType: 'account',
      updatedAt: now
    };

    return NextResponse.json({
      success: true,
      message: 'Booking has been successfully linked to your account!',
      booking: updatedBooking
    });

  } catch (error: unknown) {
    console.error("Link account error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
