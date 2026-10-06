import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { requireAuth } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { linkAccountSchema, formatZodError } from '@/lib/validation/schemas';
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
    // 1. Rate limiting
    await enforceRateLimit(req, 'link_account', 10, 60);

    // 2. Server-verified Authentication (immune to client-supplied userId spoofing)
    const authenticatedUser = await requireAuth(req);
    const userId = authenticatedUser.uid;

    // 3. Validate input payload
    const body = await req.json();
    const parseResult = linkAccountSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { reference, accessToken, phone } = parseResult.data;
    const cleanRef = reference.trim();
    const db = getAdminDatabase();

    // 4. Resolve Order ID from Reference Index
    let orderId = cleanRef;
    if (cleanRef.toUpperCase().startsWith('SLB-')) {
      const refSnap = await db.ref(`indexes/bookingReferences/${cleanRef.toUpperCase()}`).once('value');
      if (refSnap.exists()) {
        orderId = refSnap.val();
      }
    }

    // 5. Fetch booking record
    let bookingSnap = await db.ref(`bookings/${orderId}`).once('value');
    if (!bookingSnap.exists()) {
      bookingSnap = await db.ref(`tickets/${orderId}`).once('value');
    }

    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found. Please verify the booking reference.' }, { status: 404 });
    }

    const booking: Booking = bookingSnap.val();

    // 6. Verify that booking is not already claimed by a different account
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

    // 7. Verify ownership proof (AccessToken OR Phone OR Email match)
    const userSnap = await db.ref(`users/${userId}`).once('value');
    const userData = userSnap.exists() ? userSnap.val() : {};
    const userPhone = userData.phone || userData.mobile || phone || authenticatedUser.phone || '';
    const userEmail = userData.email || authenticatedUser.email || '';

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

    // 8. Update booking and index under user's account
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

    await db.ref().update(updates);

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
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
