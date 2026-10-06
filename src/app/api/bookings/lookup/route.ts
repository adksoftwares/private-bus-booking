import { NextResponse } from 'next/server';
import { ref, get, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';
import { Booking } from '@/types/booking';

function normalizePhone(p: string): string {
  if (!p) return '';
  const digits = p.replace(/[^0-9]/g, '');
  // normalize 94XXXXXXXXX to 0XXXXXXXXX
  if (digits.startsWith('94') && digits.length === 11) {
    return '0' + digits.substring(2);
  }
  return digits;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reference, phone, accessToken, userId, staffUid } = body;

    if (!reference || typeof reference !== 'string') {
      return NextResponse.json({ error: 'Valid booking reference or ID is required' }, { status: 400 });
    }

    const cleanRef = reference.trim();
    const db = getServerDatabase();

    // 1. Resolve Order ID
    let orderId = cleanRef;
    if (cleanRef.toUpperCase().startsWith('SLB-')) {
      const refSnap = await get(child(ref(db), `indexes/bookingReferences/${cleanRef.toUpperCase()}`));
      if (refSnap.exists()) {
        orderId = refSnap.val();
      }
    }

    // 2. Fetch booking record
    let bookingSnap = await get(child(ref(db), `bookings/${orderId}`));
    if (!bookingSnap.exists()) {
      bookingSnap = await get(child(ref(db), `tickets/${orderId}`));
    }

    if (!bookingSnap.exists()) {
      // Anti-enumeration: generic not found message
      return NextResponse.json({ error: 'Booking not found or verification details incorrect' }, { status: 404 });
    }

    const booking = bookingSnap.val() as Booking;

    // 3. Authorization verification
    let isAuthorized = false;

    // Check A: Signed-in user ownership
    if (userId && booking.userId && booking.userId === userId) {
      isAuthorized = true;
    }

    // Check B: Cryptographic Access Token match
    if (accessToken && booking.accessToken && booking.accessToken === accessToken) {
      isAuthorized = true;
    }

    // Check C: Phone number verification (for guest retrieval)
    if (phone) {
      const inputPhoneNorm = normalizePhone(phone);
      const bookingPhoneNorm = normalizePhone(booking.passengerPhone || booking.passengerDetails?.phone || '');
      if (inputPhoneNorm && bookingPhoneNorm && (inputPhoneNorm === bookingPhoneNorm || bookingPhoneNorm.endsWith(inputPhoneNorm) || inputPhoneNorm.endsWith(bookingPhoneNorm))) {
        isAuthorized = true;
      }
    }

    // Check D: Staff authorization
    if (staffUid) {
      const userSnap = await get(child(ref(db), `users/${staffUid}`));
      if (userSnap.exists()) {
        const role = userSnap.val().role;
        if (role === 'Admin' || role === 'Conductor' || role === 'Owner') {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      // Strictly prevent enumeration & unauthorized access
      return NextResponse.json({ 
        error: 'Verification failed. Please provide the exact phone number used when booking.' 
      }, { status: 403 });
    }

    // 4. Fetch trip snapshot or live trip details
    let trip = null;
    if (booking.tripId) {
      const tripSnap = await get(child(ref(db), `trips/${booking.tripId}`));
      if (tripSnap.exists()) {
        trip = tripSnap.val();
      }
    }

    return NextResponse.json({
      success: true,
      booking,
      trip
    });

  } catch (error: unknown) {
    console.error("Booking lookup error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
