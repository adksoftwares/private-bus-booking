import crypto from 'crypto';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { SEAT_LOCK_DURATION_MS, DEFAULT_CURRENCY } from '@/lib/constants';
import { Booking, BookingType } from '@/types/booking';
import { Trip } from '@/types/trip';
import { AuthenticatedUser, HttpError } from '@/lib/auth-server';

export interface CreateBookingParams {
  tripId: string;
  selectedSeats: string[];
  passengerDetails: {
    name: string;
    phone: string;
    email?: string;
  };
  authenticatedUser: AuthenticatedUser | null;
  guestSessionId?: string;
}

export interface PaymentNotificationParams {
  merchantId: string;
  orderId: string;
  paymentId: string;
  payhereAmount: string;
  payhereCurrency: string;
  statusCode: string;
  md5sig: string;
}

/**
 * Generates an unpredictable, cryptographic reference: SLB-XXXX-XXXX
 * Excludes easily confusable characters (0, 1, O, I).
 */
export function generateBookingReference(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let part1 = '';
  let part2 = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 4; i++) part1 += chars[bytes[i] % chars.length];
  for (let i = 4; i < 8; i++) part2 += chars[bytes[i] % chars.length];
  return `SLB-${part1}-${part2}`;
}

/**
 * Normalizes Sri Lankan phone numbers for robust, consistent lookup.
 */
export function normalizeSriLankanPhone(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('94') && clean.length >= 11) {
    clean = '0' + clean.slice(2);
  } else if (clean.length === 9 && !clean.startsWith('0')) {
    clean = '0' + clean;
  }
  return clean;
}

/**
 * Validates selected seat IDs against the bus's seat configuration.
 */
export function validateSeatsAgainstBusLayout(trip: Trip, seatIds: string[]): void {
  const layout = trip.busSnapshot?.seatLayout;
  if (!layout) return; // Legacy buses without explicit layout

  const validSeats = new Set<string>();

  // Extract valid seat labels from layout rows
  if (Array.isArray(layout.rows)) {
    for (const row of layout.rows) {
      if (Array.isArray(row.seats)) {
        for (const seat of row.seats) {
          if (seat && seat.id && seat.type !== 'empty') {
            validSeats.add(seat.id);
            if (seat.number) validSeats.add(seat.number);
          }
        }
      }
    }
  }

  // If layout configured seats exist, ensure all selected seat IDs belong to the layout
  if (validSeats.size > 0) {
    for (const seatId of seatIds) {
      if (!validSeats.has(seatId)) {
        throw new HttpError(400, `Seat '${seatId}' does not exist on this bus.`);
      }
    }
  }
}

/**
 * Atomically locks seats in Firebase Realtime Database using transactions.
 * Prevents double-booking race conditions between concurrent passengers.
 */
export async function atomicLockSeats(
  tripId: string,
  seatIds: string[],
  effectiveUserId: string,
  orderId: string
): Promise<{ success: boolean; conflictingSeat?: string }> {
  const db = getAdminDatabase();
  const locksRef = db.ref(`seatLocks/${tripId}`);
  const now = Date.now();

  let conflictingSeat: string | undefined;

  const result = await locksRef.transaction((currentLocks) => {
    currentLocks = currentLocks || {};

    // 1. Verify all requested seats are available or expired
    for (const seatId of seatIds) {
      const lock = currentLocks[seatId];
      if (lock) {
        if (lock.status === 'booked') {
          conflictingSeat = seatId;
          return; // Abort transaction
        }
        // If locked by someone else and lock has not expired
        if (lock.status === 'locked' && lock.userId !== effectiveUserId && lock.expiresAt && lock.expiresAt > now) {
          conflictingSeat = seatId;
          return; // Abort transaction
        }
      }
    }

    // 2. Reserve all requested seats atomically
    for (const seatId of seatIds) {
      currentLocks[seatId] = {
        userId: effectiveUserId,
        status: 'locked',
        bookingId: orderId,
        expiresAt: now + SEAT_LOCK_DURATION_MS
      };
    }

    return currentLocks;
  });

  if (!result.committed) {
    return {
      success: false,
      conflictingSeat: conflictingSeat || seatIds[0]
    };
  }

  return { success: true };
}

/**
 * Creates a pending booking with atomic seat reservation and authoritative pricing.
 */
export async function createPendingBooking(params: CreateBookingParams): Promise<Booking> {
  const { tripId, selectedSeats, passengerDetails, authenticatedUser, guestSessionId } = params;
  const db = getAdminDatabase();

  // 1. Fetch Authoritative Trip
  const tripSnap = await db.ref(`trips/${tripId}`).once('value');
  if (!tripSnap.exists()) {
    throw new HttpError(404, 'Selected trip schedule not found.');
  }

  const trip: Trip = tripSnap.val();
  if (trip.status && trip.status !== 'scheduled') {
    throw new HttpError(400, `This trip is not available for booking (Status: ${trip.status}).`);
  }

  // 2. Validate seat configuration
  validateSeatsAgainstBusLayout(trip, selectedSeats);

  // 3. Authoritative Fare Calculation (Server-derived, immune to client tampering)
  const baseFare = Number(trip.farePerSeat !== undefined && trip.farePerSeat !== null ? trip.farePerSeat : trip.baseFare);
  if (!baseFare || isNaN(baseFare) || baseFare <= 0) {
    throw new HttpError(500, 'Invalid bus ticket pricing configuration for this trip.');
  }
  const authoritativeTotal = baseFare * selectedSeats.length;

  // 4. Generate Identifiers
  const now = Date.now();
  const orderId = `BK-${now}-${Math.floor(1000 + Math.random() * 9000)}`;
  const bookingReference = generateBookingReference();
  const accessToken = crypto.randomBytes(24).toString('hex');

  const isAuthenticated = Boolean(authenticatedUser);
  const bookingType: BookingType = isAuthenticated ? 'account' : 'guest';
  const effectiveUserId = isAuthenticated ? authenticatedUser!.uid : (guestSessionId || `gst_${accessToken.slice(0, 12)}`);

  // 5. Execute Atomic Seat Lock Transaction
  const lockResult = await atomicLockSeats(tripId, selectedSeats, effectiveUserId, orderId);
  if (!lockResult.success) {
    throw new HttpError(
      409,
      `Seat '${lockResult.conflictingSeat}' was just reserved by another passenger. Please select another seat.`
    );
  }

  // 6. Build authoritatively calculated booking payload
  const pendingBooking: Booking = {
    id: orderId,
    bookingReference,
    accessToken,
    bookingType,
    tripId,
    userId: isAuthenticated ? authenticatedUser!.uid : null,
    ownerId: trip.ownerId || '',
    passengerName: passengerDetails.name.trim(),
    passengerPhone: passengerDetails.phone.trim(),
    passengerEmail: passengerDetails.email?.trim() || '',
    passengerDetails: {
      name: passengerDetails.name.trim(),
      phone: passengerDetails.phone.trim(),
      email: passengerDetails.email?.trim() || '',
      uid: isAuthenticated ? authenticatedUser!.uid : null
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

  // 7. Write pending booking & lookup indexes
  const updates: Record<string, unknown> = {};
  updates[`bookings/${orderId}`] = pendingBooking;
  updates[`indexes/bookingReferences/${bookingReference}`] = orderId;

  if (isAuthenticated && authenticatedUser) {
    updates[`indexes/userBookings/${authenticatedUser.uid}/${orderId}`] = true;
  } else {
    const cleanPhone = normalizeSriLankanPhone(passengerDetails.phone);
    if (cleanPhone) {
      updates[`indexes/phoneBookings/${cleanPhone}/${orderId}`] = true;
    }
  }

  await db.ref().update(updates);
  return pendingBooking;
}

/**
 * Confirms payment authoritatively via server webhook IPN.
 * Strictly verifies amount, currency, merchant ID, and state machine validity.
 */
export async function confirmBookingPayment(params: PaymentNotificationParams): Promise<{ status: string; orderId: string }> {
  const { merchantId, orderId, paymentId, payhereAmount, payhereCurrency, statusCode, md5sig } = params;

  const secret = process.env.PAYHERE_SECRET;
  const configuredMerchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || process.env.PAYHERE_MERCHANT_ID;

  if (!secret || !configuredMerchantId) {
    throw new HttpError(500, 'Payment gateway configuration is missing.');
  }

  // 1. Verify merchant identity
  if (merchantId !== configuredMerchantId) {
    throw new HttpError(400, 'Merchant ID mismatch.');
  }

  // 2. Verify official PayHere MD5 checksum signature
  const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
  const hashString = `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${hashedSecret}`;
  const localHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

  if (localHash !== md5sig) {
    throw new HttpError(400, 'Payment signature verification failed.');
  }

  const db = getAdminDatabase();
  const bookingSnap = await db.ref(`bookings/${orderId}`).once('value');

  if (!bookingSnap.exists()) {
    throw new HttpError(404, `Booking not found for order ${orderId}`);
  }

  const booking: Booking = bookingSnap.val();
  const now = Date.now();

  // 3. Process Success (Status 2)
  if (statusCode === '2') {
    // Idempotency: If already confirmed or boarded, return cleanly
    if (booking.status === 'confirmed' || booking.status === 'boarded') {
      return { status: 'already_confirmed', orderId };
    }

    // State machine check: Never allow cancelled bookings to be confirmed
    if (booking.status === 'cancelled') {
      throw new HttpError(400, 'Cannot confirm payment on an already cancelled booking.');
    }

    // Currency check
    if (payhereCurrency !== DEFAULT_CURRENCY) {
      throw new HttpError(400, `Unexpected payment currency: ${payhereCurrency}. Expected ${DEFAULT_CURRENCY}.`);
    }

    // Authoritative Amount check
    const paidAmount = parseFloat(payhereAmount);
    const expectedAmount = Number(booking.totalAmount);
    if (isNaN(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
      throw new HttpError(
        400,
        `Payment amount mismatch: received ${paidAmount} LKR, expected ${expectedAmount} LKR.`
      );
    }

    const updates: Record<string, unknown> = {};

    // Update booking state
    updates[`bookings/${orderId}/status`] = 'confirmed';
    updates[`bookings/${orderId}/paymentId`] = paymentId;
    updates[`bookings/${orderId}/paidAmount`] = paidAmount;
    updates[`bookings/${orderId}/updatedAt`] = now;

    // Redundant ticket pass record
    updates[`tickets/${orderId}`] = {
      ...booking,
      status: 'confirmed',
      paymentId,
      paidAmount,
      updatedAt: now
    };

    // Convert temporary seat locks to permanent 'booked'
    if (Array.isArray(booking.seats)) {
      booking.seats.forEach((seatId: string) => {
        updates[`seatLocks/${booking.tripId}/${seatId}`] = {
          userId: booking.userId || 'guest',
          status: 'booked',
          bookingId: orderId,
          bookedAt: now
        };
      });
    }

    // Audit log
    updates[`payments/${orderId}`] = {
      orderId,
      paymentId,
      amount: paidAmount,
      currency: payhereCurrency,
      status: 'success',
      timestamp: now
    };

    await db.ref().update(updates);
    return { status: 'confirmed', orderId };

  } else if (statusCode === '-1' || statusCode === '-2') {
    // Payment Cancelled (-1) or Failed (-2)
    const updates: Record<string, unknown> = {};
    updates[`bookings/${orderId}/status`] = 'payment_failed';
    updates[`bookings/${orderId}/updatedAt`] = now;

    // Release seat locks so seats are immediately freed
    if (Array.isArray(booking.seats)) {
      booking.seats.forEach((seatId: string) => {
        updates[`seatLocks/${booking.tripId}/${seatId}`] = null;
      });
    }

    await db.ref().update(updates);
    return { status: 'payment_failed', orderId };
  }

  return { status: `acknowledged_${statusCode}`, orderId };
}

/**
 * Atomically marks a ticket as boarded.
 * Guarantees that two concurrent conductor scans cannot both board the same passenger.
 */
export async function atomicBoardTicket(
  bookingId: string,
  staffUser: AuthenticatedUser
): Promise<{ success: boolean; reason?: string; boardedAt?: number; boardedBy?: string; booking?: Booking }> {
  const db = getAdminDatabase();
  const bookingRef = db.ref(`bookings/${bookingId}`);
  const now = Date.now();

  let abortReason: string | undefined;
  let alreadyBoardedAt: number | undefined;
  let alreadyBoardedBy: string | undefined;

  const result = await bookingRef.transaction((currentBooking) => {
    if (!currentBooking) {
      abortReason = 'NOT_FOUND';
      return;
    }

    if (currentBooking.status === 'cancelled') {
      abortReason = 'CANCELLED';
      return;
    }

    if (currentBooking.status === 'pending' || currentBooking.status === 'payment_failed') {
      abortReason = 'UNPAID';
      return;
    }

    if (currentBooking.boarded || currentBooking.status === 'boarded') {
      abortReason = 'ALREADY_BOARDED';
      alreadyBoardedAt = currentBooking.boardedAt;
      alreadyBoardedBy = currentBooking.boardedBy;
      return;
    }

    // Atomic update
    currentBooking.boarded = true;
    currentBooking.boardedAt = now;
    currentBooking.boardedBy = staffUser.uid;
    currentBooking.status = 'boarded';
    currentBooking.updatedAt = now;

    return currentBooking;
  });

  if (!result.committed) {
    return {
      success: false,
      reason: abortReason || 'TRANSACTION_FAILED',
      boardedAt: alreadyBoardedAt,
      boardedBy: alreadyBoardedBy
    };
  }

  const updatedBooking: Booking = result.snapshot.val();

  // Mirror to tickets node for consistency
  const ticketUpdates: Record<string, unknown> = {
    [`tickets/${bookingId}/boarded`]: true,
    [`tickets/${bookingId}/boardedAt`]: now,
    [`tickets/${bookingId}/boardedBy`]: staffUser.uid,
    [`tickets/${bookingId}/status`]: 'boarded',
    [`tickets/${bookingId}/updatedAt`]: now,
    [`auditLogs/boarding/${bookingId}_${now}`]: {
      bookingId,
      staffUid: staffUser.uid,
      staffEmail: staffUser.email || '',
      tripId: updatedBooking.tripId,
      timestamp: now
    }
  };
  await db.ref().update(ticketUpdates);

  return {
    success: true,
    boardedAt: now,
    boardedBy: staffUser.uid,
    booking: updatedBooking
  };
}

/**
 * Cancels a booking and applies the authoritative refund schedule.
 * Releases booked seats immediately and writes audit logs.
 */
export async function cancelBookingWithRefund(
  bookingId: string,
  cancellingUserUid: string | null
): Promise<{ success: boolean; refundPercentage: number; refundAmount: number; message: string }> {
  const db = getAdminDatabase();
  const bookingSnap = await db.ref(`bookings/${bookingId}`).once('value');

  if (!bookingSnap.exists()) {
    throw new HttpError(404, 'Booking not found.');
  }

  const booking: Booking = bookingSnap.val();

  if (booking.status === 'cancelled') {
    throw new HttpError(400, 'This booking has already been cancelled.');
  }

  if (booking.boarded || booking.status === 'boarded') {
    throw new HttpError(400, 'Cannot cancel a ticket that has already been boarded.');
  }

  // Fetch trip departure to compute authoritative refund tier
  const tripSnap = await db.ref(`trips/${booking.tripId}`).once('value');
  let refundPercentage = 0;
  const now = Date.now();

  if (tripSnap.exists()) {
    const trip: Trip = tripSnap.val();
    if (trip.departureDate && trip.departureTime) {
      const departureTimeStr = `${trip.departureDate}T${trip.departureTime}:00`;
      const departureDate = new Date(departureTimeStr);
      const diffHours = (departureDate.getTime() - now) / (1000 * 60 * 60);

      if (diffHours > 24) {
        refundPercentage = 100;
      } else if (diffHours >= 12) {
        refundPercentage = 50;
      } else {
        refundPercentage = 0;
      }
    }
  }

  const originalAmount = Number(booking.fares?.ticketAmount || booking.totalAmount || 0);
  const refundAmount = (originalAmount * refundPercentage) / 100;
  const refundId = `RF-${Date.now()}`;

  const updates: Record<string, unknown> = {};
  updates[`bookings/${bookingId}/status`] = 'cancelled';
  updates[`bookings/${bookingId}/cancelledAt`] = now;
  updates[`bookings/${bookingId}/cancelledBy`] = cancellingUserUid || 'guest';
  updates[`bookings/${bookingId}/refundId`] = refundId;

  updates[`tickets/${bookingId}/status`] = 'cancelled';
  updates[`tickets/${bookingId}/cancelledAt`] = now;

  // Record refund transaction
  updates[`refunds/${refundId}`] = {
    id: refundId,
    bookingId,
    userId: booking.userId || 'guest',
    originalAmount,
    refundAmount,
    refundPercentage,
    status: refundAmount > 0 ? 'pending_payout' : 'no_refund',
    createdAt: now
  };

  // Release all booked seats immediately
  if (Array.isArray(booking.seats)) {
    booking.seats.forEach((seatId: string) => {
      updates[`seatLocks/${booking.tripId}/${seatId}`] = null;
    });
  }

  await db.ref().update(updates);

  return {
    success: true,
    refundPercentage,
    refundAmount,
    message: refundAmount > 0
      ? `Booking cancelled successfully. You are eligible for a ${refundPercentage}% refund (Rs. ${refundAmount.toFixed(2)}).`
      : 'Booking cancelled successfully. No refund is applicable as departure is within 12 hours.'
  };
}
