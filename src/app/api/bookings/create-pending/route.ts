import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';
import { Booking, BookingType } from '@/types/booking';
import { Trip } from '@/types/trip';

function generateBookingReference(): string {
  // Unpredictable, cryptographic reference: SLB-XXXX-XXXX (excluding ambiguous chars 0, 1, O, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let part1 = '';
  let part2 = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) part1 += chars[bytes[i] % chars.length];
  for (let i = 4; i < 8; i++) part2 += chars[bytes[i] % chars.length];
  return `SLB-${part1}-${part2}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tripId, selectedSeats, passengerDetails, userId, guestSessionId } = body;

    // 1. Basic validation
    if (!tripId || typeof tripId !== 'string') {
      return NextResponse.json({ error: 'Valid tripId is required' }, { status: 400 });
    }
    if (!Array.isArray(selectedSeats) || selectedSeats.length === 0) {
      return NextResponse.json({ error: 'At least one seat must be selected' }, { status: 400 });
    }
    if (selectedSeats.length > 6) {
      return NextResponse.json({ error: 'Maximum 6 seats per booking' }, { status: 400 });
    }
    if (!passengerDetails?.name?.trim() || !passengerDetails?.phone?.trim()) {
      return NextResponse.json({ error: 'Passenger name and phone number are required' }, { status: 400 });
    }

    // Determine booking mode: account or guest
    const isAuthenticated = Boolean(userId && typeof userId === 'string');
    const bookingType: BookingType = isAuthenticated ? 'account' : 'guest';
    const effectiveUserId = isAuthenticated ? (userId as string) : (guestSessionId || 'guest_session');

    const db = getServerDatabase();

    // 2. Fetch authoritative Trip
    const tripSnap = await get(child(ref(db), `trips/${tripId}`));
    if (!tripSnap.exists()) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }
    const trip: Trip = tripSnap.val();

    if (trip.status && trip.status !== 'scheduled') {
      return NextResponse.json({ error: `Trip is not available for booking (Status: ${trip.status})` }, { status: 400 });
    }

    // 3. Verify seat availability against existing bookings / locks
    const locksSnap = await get(child(ref(db), `seatLocks/${tripId}`));
    const existingLocks = locksSnap.exists() ? locksSnap.val() : {};
    const now = Date.now();

    for (const seatId of selectedSeats) {
      const lock = existingLocks[seatId];
      if (lock) {
        if (lock.status === 'booked') {
          return NextResponse.json({ error: `Seat ${seatId} has already been booked` }, { status: 409 });
        }
        // If locked by someone else and not expired (5 min lock)
        if (lock.status === 'locked' && lock.userId !== effectiveUserId && lock.expiresAt && lock.expiresAt > now) {
          return NextResponse.json({ error: `Seat ${seatId} is temporarily reserved by another passenger` }, { status: 409 });
        }
      }
    }

    // 4. Calculate authoritative fare (Never trust client-calculated total!)
    const baseFare = Number(trip.farePerSeat !== undefined && trip.farePerSeat !== null ? trip.farePerSeat : trip.baseFare);
    if (!baseFare || isNaN(baseFare) || baseFare <= 0) {
      return NextResponse.json({ error: 'Invalid bus fare pricing configuration for this scheduled trip' }, { status: 500 });
    }
    const authoritativeTotal = baseFare * selectedSeats.length;

    // 5. Generate secure, unique order ID & cryptographic booking reference & access token
    const orderId = `BK-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const bookingReference = generateBookingReference();
    const accessToken = crypto.randomBytes(24).toString('hex');

    // 6. Build pending booking record
    const pendingBooking: Booking = {
      id: orderId,
      bookingReference,
      accessToken,
      bookingType,
      tripId,
      userId: isAuthenticated ? (userId as string) : null,
      ownerId: trip.ownerId || '',
      passengerName: passengerDetails.name.trim(),
      passengerPhone: passengerDetails.phone.trim(),
      passengerEmail: passengerDetails.email?.trim() || '',
      passengerDetails: {
        name: passengerDetails.name.trim(),
        phone: passengerDetails.phone.trim(),
        email: passengerDetails.email?.trim() || '',
        uid: isAuthenticated ? (userId as string) : null
      },
      seats: selectedSeats,
      totalAmount: authoritativeTotal,
      fares: {
        ticketAmount: authoritativeTotal,
        serviceFee: 0,
        total: authoritativeTotal
      },
      status: 'pending',
      createdAt: now,
      tripSnapshot: {
        departureDate: trip.departureDate,
        departureTime: trip.departureTime,
        routeSnapshot: trip.routeSnapshot,
        busSnapshot: trip.busSnapshot,
        baseFare: trip.baseFare,
        ownerId: trip.ownerId
      }
    };

    // 7. Atomic batch update in RTDB: pending booking + temporary lock on seats
    const updates: Record<string, unknown> = {};
    updates[`bookings/${orderId}`] = pendingBooking;
    updates[`indexes/bookingReferences/${bookingReference}`] = orderId;

    if (isAuthenticated && userId) {
      updates[`indexes/userBookings/${userId}/${orderId}`] = true;
    } else {
      const cleanPhone = passengerDetails.phone.trim().replace(/[^0-9]/g, '');
      if (cleanPhone) {
        updates[`indexes/phoneBookings/${cleanPhone}/${orderId}`] = true;
      }
    }

    selectedSeats.forEach(seatId => {
      updates[`seatLocks/${tripId}/${seatId}`] = {
        userId: effectiveUserId,
        status: 'locked',
        bookingId: orderId,
        expiresAt: now + 15 * 60 * 1000 // 15 minutes checkout window
      };
    });

    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    await update(ref(db), sanitizedUpdates);

    return NextResponse.json({
      success: true,
      orderId,
      bookingReference,
      accessToken,
      bookingType,
      amount: authoritativeTotal,
      booking: pendingBooking
    });
  } catch (error: unknown) {
    console.error("Create pending booking error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
