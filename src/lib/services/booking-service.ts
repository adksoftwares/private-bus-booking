import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { SEAT_LOCK_DURATION_MS, DEFAULT_CURRENCY, MAX_SEATS_PER_BOOKING } from '@/lib/constants';
import { Booking, BookingType } from '@/types/booking';
import { Trip } from '@/types/trip';
import { AuthenticatedUser, HttpError, logAudit } from '@/lib/auth-server';
import { Json } from '@/types/database';

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
  if (!layout) return;

  const validSeats = new Set<string>();

  const rows = (layout as unknown as Record<string, unknown>).rows;
  if (Array.isArray(rows)) {
    for (const row of rows) {
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

  if (validSeats.size > 0) {
    for (const seatId of seatIds) {
      if (!validSeats.has(seatId)) {
        throw new HttpError(400, `Seat '${seatId}' does not exist on this bus.`);
      }
    }
  }
}

/**
 * Atomically locks seats in PostgreSQL using Supabase.
 * Prevents double-booking race conditions between concurrent passengers.
 */
export async function atomicLockSeats(
  tripId: string,
  seatIds: string[],
  effectiveUserId: string,
  orderId: string
): Promise<{ success: boolean; conflictingSeat?: string }> {
  if (!seatIds || seatIds.length === 0) {
    return { success: false };
  }

  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    return { success: false, conflictingSeat: seatIds[MAX_SEATS_PER_BOOKING] };
  }

  const supabase = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SEAT_LOCK_DURATION_MS).toISOString();

  // Try PostgreSQL RPC function first
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('lock_seats_atomic', {
      p_trip_id: tripId,
      p_seat_ids: seatIds,
      p_user_id: effectiveUserId,
      p_booking_id: orderId,
      p_duration_seconds: Math.floor(SEAT_LOCK_DURATION_MS / 1000)
    });

    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
      const res = rpcResult as { success: boolean; conflicting_seat?: string };
      if (!res.success) {
        return { success: false, conflictingSeat: res.conflicting_seat };
      }
      return { success: true };
    }
  } catch {
    // If RPC is unavailable, fall back to atomic direct query
  }

  // Fail closed if the atomic database primitive is unavailable. A direct
  // read/check/upsert sequence is not transactionally safe under concurrent load.
  throw new HttpError(503, 'Seat reservation service is temporarily unavailable. Please try again.');

  /*
  // Legacy non-atomic fallback intentionally disabled.
  await supabase
    .from('seat_locks')
    .delete()
    .eq('trip_id', tripId)
    .eq('status', 'locked')
    .lt('expires_at', nowIso);

  // Check existing locks
  const { data: existingLocks } = await supabase
    .from('seat_locks')
    .select('seat_id, user_id, status, expires_at')
    .eq('trip_id', tripId)
    .in('seat_id', seatIds);

  if (existingLocks && existingLocks.length > 0) {
    for (const lock of existingLocks) {
      if (lock.status === 'booked') {
        return { success: false, conflictingSeat: lock.seat_id };
      }
      if (lock.status === 'locked' && lock.user_id !== effectiveUserId) {
        if (!lock.expires_at || new Date(lock.expires_at).getTime() > Date.now()) {
          return { success: false, conflictingSeat: lock.seat_id };
        }
      }
    }
  }

  // Insert or update seat locks
  const lockRecords = seatIds.map(seatId => ({
    trip_id: tripId,
    seat_id: seatId,
    user_id: effectiveUserId,
    booking_id: orderId,
    status: 'locked' as const,
    created_at: nowIso,
    expires_at: expiresAt
  }));

  const { error: upsertError } = await supabase
    .from('seat_locks')
    .upsert(lockRecords, { onConflict: 'trip_id,seat_id' });

  if (upsertError) {
    console.error("Lock seat upsert error:", upsertError);
    return { success: false, conflictingSeat: seatIds[0] };
  }

  return { success: true };
  */
}

/**
 * Creates a pending booking with atomic seat reservation and authoritative pricing.
 */
export async function createPendingBooking(params: CreateBookingParams) {
  const { tripId, selectedSeats, passengerDetails, authenticatedUser, guestSessionId } = params;
  const supabase = getSupabaseAdminClient();

  if (!selectedSeats || selectedSeats.length === 0) {
    throw new HttpError(400, 'Please select at least one seat to proceed.');
  }

  if (selectedSeats.length > MAX_SEATS_PER_BOOKING) {
    throw new HttpError(400, `You cannot reserve more than ${MAX_SEATS_PER_BOOKING} seats per transaction.`);
  }

  // 1. Fetch trip authoritatively from Supabase
  const { data: tripData, error: tripError } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (tripError || !tripData) {
    throw new HttpError(404, 'The requested bus trip could not be found.');
  }

  const trip = {
    id: tripData.id,
    busId: tripData.bus_id,
    ownerId: tripData.owner_id,
    routeId: tripData.route_id || '',
    routeSnapshot: tripData.route_snapshot,
    busSnapshot: tripData.bus_snapshot,
    departureDate: tripData.departure_date,
    departureTime: tripData.departure_time,
    arrivalTime: tripData.arrival_time,
    duration: tripData.duration,
    baseFare: tripData.base_fare,
    farePerSeat: tripData.fare_per_seat,
    operatorName: tripData.operator_name,
    status: tripData.status
  } as unknown as Trip;

  if (trip.status === 'cancelled') {
    throw new HttpError(400, 'This trip has been cancelled and is no longer accepting reservations.');
  }

  validateSeatsAgainstBusLayout(trip, selectedSeats);

  // 2. Authoritative Fare Calculation
  const individualFare = Number(trip.farePerSeat || trip.baseFare || 0);
  if (individualFare <= 0) {
    throw new HttpError(400, 'Invalid fare configuration for this trip schedule.');
  }

  const ticketAmount = selectedSeats.length * individualFare;
  const commissionRate = 0.10;
  const platformCommission = Math.round(ticketAmount * commissionRate * 100) / 100;
  const gatewayFee = Math.round(ticketAmount * 0.03 * 100) / 100;
  const ownerNetAmount = Math.round((ticketAmount - platformCommission - gatewayFee) * 100) / 100;

  // 3. Generate secure identifiers
  const timestamp = Date.now();
  const orderId = `BK-${timestamp}-${Math.floor(Math.random() * 900 + 100)}`;
  const bookingReference = generateBookingReference();
  const accessToken = crypto.randomBytes(24).toString('hex');
  const bookingType: BookingType = authenticatedUser ? 'account' : 'guest';
  const effectiveUserId = authenticatedUser?.uid || guestSessionId || `gst_${accessToken.substring(0, 12)}`;

  // 4. Atomically Lock Seats
  const lockResult = await atomicLockSeats(tripId, selectedSeats, effectiveUserId, orderId);
  if (!lockResult.success) {
    throw new HttpError(
      409,
      `Seat ${lockResult.conflictingSeat || 'selection'} is no longer available. Please select another seat.`
    );
  }

  // 5. Build Booking Object
  const newBooking = {
    id: orderId,
    booking_reference: bookingReference,
    access_token: accessToken,
    booking_type: bookingType,
    trip_id: tripId,
    user_id: authenticatedUser?.uid || null,
    owner_id: trip.ownerId,
    passenger_name: passengerDetails.name.trim(),
    passenger_phone: passengerDetails.phone.trim(),
    passenger_email: passengerDetails.email?.trim() || null,
    passenger_details: {
      name: passengerDetails.name.trim(),
      phone: passengerDetails.phone.trim(),
      email: passengerDetails.email?.trim() || '',
      uid: authenticatedUser?.uid || null
    },
    seats: selectedSeats,
    total_amount: ticketAmount,
    fares: {
      ticketAmount,
      platformCommission,
      gatewayFee,
      ownerNetAmount
    },
    status: 'pending' as const,
    boarded: false,
    trip_snapshot: {
      departureDate: trip.departureDate,
      departureTime: trip.departureTime,
      arrivalTime: trip.arrivalTime,
      duration: trip.duration,
      routeSnapshot: trip.routeSnapshot,
      busSnapshot: trip.busSnapshot,
      baseFare: individualFare,
      farePerSeat: individualFare,
      ownerId: trip.ownerId,
      operatorName: trip.operatorName
    } as unknown as Json,
    created_at: new Date().toISOString()
  };

  const { error: insertBookingError } = await supabase
    .from('bookings')
    .insert([newBooking]);

  if (insertBookingError) {
    console.error("Failed to insert pending booking:", insertBookingError);
    // Cleanup temporary seat locks to prevent deadlocks
    await supabase
      .from('seat_locks')
      .delete()
      .eq('trip_id', tripId)
      .eq('booking_id', orderId);
    throw new HttpError(500, 'Failed to create reservation record.');
  }

  // Record audit log
  await logAudit(
    'PENDING_BOOKING_CREATED',
    'booking',
    orderId,
    { tripId, seats: selectedSeats, amount: ticketAmount, bookingType },
    authenticatedUser?.uid || null,
    authenticatedUser?.role || 'Guest'
  );

  // 6. Generate PayHere Checkout Signature
  const merchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || '';
  const merchantSecret = process.env.PAYHERE_SECRET || '';
  const formattedAmount = ticketAmount.toFixed(2);
  const currency = DEFAULT_CURRENCY;

  let paymentHash = '';
  if (merchantId && merchantSecret) {
    const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
    const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
    paymentHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
  }

  return {
    id: orderId,
    bookingId: orderId,
    bookingReference,
    accessToken,
    bookingType,
    totalAmount: ticketAmount,
    currency,
    merchantId,
    paymentHash,
    trip,
    lockDurationMs: SEAT_LOCK_DURATION_MS
  };
}

/**
 * Looks up a booking by reference or ID with secure authorization checks.
 */
export async function lookupBookingByReference(
  reference: string,
  accessToken?: string,
  authenticatedUserId?: string,
  providedPhone?: string
): Promise<{ booking: Booking; trip: Trip }> {
  if (!reference) {
    throw new HttpError(400, 'Booking reference or Order ID is required.');
  }

  const supabase = getSupabaseAdminClient();
  const cleanRef = reference.trim();

  // Query by id OR booking_reference
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .or(`id.eq.${cleanRef},booking_reference.eq.${cleanRef}`)
    .maybeSingle();

  if (bookingError || !bookingData) {
    throw new HttpError(404, `Booking #${cleanRef} was not found.`);
  }

  const booking = {
    id: bookingData.id,
    bookingReference: bookingData.booking_reference,
    accessToken: bookingData.access_token,
    bookingType: bookingData.booking_type,
    tripId: bookingData.trip_id,
    userId: bookingData.user_id,
    ownerId: bookingData.owner_id,
    passengerName: bookingData.passenger_name,
    passengerPhone: bookingData.passenger_phone,
    passengerEmail: bookingData.passenger_email || undefined,
    passengerDetails: bookingData.passenger_details as Record<string, unknown>,
    seats: bookingData.seats,
    totalAmount: Number(bookingData.total_amount),
    fares: bookingData.fares as Record<string, unknown>,
    status: bookingData.status,
    boarded: bookingData.boarded,
    boardedAt: bookingData.boarded_at ? new Date(bookingData.boarded_at).getTime() : undefined,
    boardedBy: bookingData.boarded_by || undefined,
    paymentId: bookingData.payment_id || undefined,
    refundId: bookingData.refund_id || undefined,
    tripSnapshot: bookingData.trip_snapshot as Record<string, unknown>,
    createdAt: new Date(bookingData.created_at).getTime()
  } as unknown as Booking;

  // Authorization Check
  let isAuthorized = false;
  let isTokenOrAccountAuth = false;

  if (accessToken && booking.accessToken && accessToken === booking.accessToken) {
    isAuthorized = true;
    isTokenOrAccountAuth = true;
  } else if (authenticatedUserId && booking.userId && authenticatedUserId === booking.userId) {
    isAuthorized = true;
    isTokenOrAccountAuth = true;
  }

  // A phone number is not an authentication factor. It is intentionally NOT
  // accepted as a standalone authorization credential for booking disclosure.
  if (!isAuthorized) {
    throw new HttpError(
      403,
      'Access verification required. Please use your booking access token or signed-in account.'
    );
  }

  // This response is only returned after cryptographic token or account authorization.
  if (!isTokenOrAccountAuth) {
    booking.accessToken = '';
  }

  // Fetch full trip details
  const { data: tripData } = await supabase
    .from('trips')
    .select('*')
    .eq('id', booking.tripId)
    .maybeSingle();

  const trip = tripData ? ({
    id: tripData.id,
    busId: tripData.bus_id,
    ownerId: tripData.owner_id,
    routeId: tripData.route_id || '',
    routeSnapshot: tripData.route_snapshot,
    busSnapshot: tripData.bus_snapshot,
    departureDate: tripData.departure_date,
    departureTime: tripData.departure_time,
    arrivalTime: tripData.arrival_time,
    duration: tripData.duration,
    baseFare: tripData.base_fare,
    farePerSeat: tripData.fare_per_seat,
    operatorName: tripData.operator_name,
    status: tripData.status
  } as unknown as Trip) : (booking.tripSnapshot as unknown as Trip);

  return { booking, trip };
}

/**
 * Links a past guest booking to an authenticated user account.
 * Requires the cryptographic accessToken to prevent phone-based hijacking.
 */
export async function linkGuestBookingToAccount(
  reference: string,
  accessToken: string | undefined,
  phone: string | undefined,
  authenticatedUserId: string
) {
  if (!reference) throw new HttpError(400, 'Booking reference is required.');
  if (!authenticatedUserId) throw new HttpError(401, 'Please sign in to link your booking.');

  const supabase = getSupabaseAdminClient();
  const cleanRef = reference.trim();

  const { data: booking, error: findError } = await supabase
    .from('bookings')
    .select('*')
    .or(`id.eq.${cleanRef},booking_reference.eq.${cleanRef}`)
    .maybeSingle();

  if (findError || !booking) {
    throw new HttpError(404, `Booking #${cleanRef} was not found.`);
  }

  if (booking.user_id && booking.user_id === authenticatedUserId) {
    return { success: true, message: 'This booking is already linked to your account.', bookingId: booking.id };
  }

  if (booking.user_id && booking.user_id !== authenticatedUserId) {
    throw new HttpError(403, 'This booking has already been claimed by another registered account.');
  }

  // Cryptographic token verification is mandatory to prevent phone guessing attacks
  if (!accessToken || !booking.access_token || accessToken !== booking.access_token) {
    throw new HttpError(403, 'Verification failed. A valid booking access token is required to claim this reservation.');
  }

  if (phone) {
    const normProvided = normalizeSriLankanPhone(phone);
    const normPassenger = normalizeSriLankanPhone(booking.passenger_phone || '');
    if (normProvided && normPassenger && normProvided !== normPassenger) {
      throw new HttpError(403, 'Verification failed. The provided phone number does not match this booking.');
    }
  }

  // Update booking in Supabase
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      user_id: authenticatedUserId,
      booking_type: 'account',
      updated_at: new Date().toISOString()
    })
    .eq('id', booking.id);

  if (updateError) {
    console.error("Failed to link booking to account:", updateError);
    throw new HttpError(500, 'Database error while linking booking.');
  }

  await logAudit(
    'GUEST_BOOKING_LINKED',
    'booking',
    booking.id,
    { reference: cleanRef, claimedBy: authenticatedUserId },
    authenticatedUserId,
    'Passenger'
  );

  return {
    success: true,
    message: 'Booking successfully linked to your account!',
    bookingId: booking.id
  };
}

/**
 * Cancels a booking, computes eligible refunds, and frees up seats atomically.
 * Requires authenticated account ownership, admin privileges, or cryptographic access token.
 */
export async function cancelBooking(
  bookingId: string,
  authenticatedUser: AuthenticatedUser | null,
  accessToken?: string
) {
  const supabase = getSupabaseAdminClient();

  // 1. Try PostgreSQL atomic cancellation RPC first
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_booking_atomic', {
      p_booking_id: bookingId,
      p_caller_id: authenticatedUser?.uid || undefined,
      p_access_token: accessToken || undefined,
      p_is_admin: authenticatedUser?.isAdmin || false
    });

    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
      const res = rpcResult as {
        success: boolean;
        reason?: string;
        message?: string;
        refund_percentage?: number;
        refund_amount?: number;
        refund_id?: string;
      };

      if (!res.success) {
        if (res.reason === 'not_found') throw new HttpError(404, 'Booking not found.');
        if (res.reason === 'unauthorized') throw new HttpError(403, 'You are not authorized to cancel this booking.');
        if (res.reason === 'already_cancelled') throw new HttpError(400, 'This booking has already been cancelled.');
        throw new HttpError(400, res.message || 'Cancellation rejected.');
      }

      return {
        success: true,
        refundPercentage: res.refund_percentage ?? 0,
        refundAmount: res.refund_amount ?? 0,
        refundId: res.refund_id,
        message: res.message || 'Booking cancelled successfully.'
      };
    }
  } catch (rpcErr) {
    if (rpcErr instanceof HttpError) throw rpcErr;
  }

  // Fail closed when the database transaction is unavailable. Continuing with
  // separate UPDATE/INSERT/DELETE operations can leave booking and seat state inconsistent.
  throw new HttpError(503, 'Cancellation service is temporarily unavailable. Please try again.');

  /*
  // Legacy non-atomic fallback intentionally disabled.
  const { data: bookingData, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (bookingError || !bookingData) {
    throw new HttpError(404, 'Booking not found.');
  }

  // Strict Authorization: Admin OR registered user who owns booking OR valid guest accessToken
  let isAuthorized = false;
  if (authenticatedUser?.isAdmin) {
    isAuthorized = true;
  } else if (authenticatedUser?.uid && bookingData.user_id === authenticatedUser.uid) {
    isAuthorized = true;
  } else if (accessToken && bookingData.access_token && bookingData.access_token === accessToken) {
    isAuthorized = true;
  }

  if (!isAuthorized) {
    throw new HttpError(403, 'Unauthorized: Valid account ownership or booking access token is required to cancel.');
  }

  if (bookingData.status === 'cancelled') {
    throw new HttpError(400, 'This booking has already been cancelled.');
  }

  // Calculate refund policy based on departure date/time
  const tripSnapshot = bookingData.trip_snapshot as Record<string, unknown>;
  const departureDate = tripSnapshot?.departureDate as string;
  const departureTime = tripSnapshot?.departureTime as string;

  let refundPercentage = 0;
  if (departureDate && departureTime) {
    const departureDateTime = new Date(`${departureDate}T${departureTime}:00`);
    const diffHours = (departureDateTime.getTime() - Date.now()) / (1000 * 60 * 60);

    if (diffHours > 24) refundPercentage = 100;
    else if (diffHours >= 12) refundPercentage = 50;
    else refundPercentage = 0;
  }

  const fares = bookingData.fares as Record<string, unknown>;
  const originalTicketAmount = Number(fares?.ticketAmount || bookingData.total_amount || 0);
  const refundAmount = Math.round(((originalTicketAmount * refundPercentage) / 100) * 100) / 100;
  const refundId = `RF-${Date.now()}`;

  // Update booking status
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      refund_id: refundId,
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId);

  // Insert refund record
  await supabase
    .from('refunds')
    .insert([{
      id: refundId,
      booking_id: bookingId,
      user_id: authenticatedUser?.uid || bookingData.user_id || 'guest',
      original_amount: originalTicketAmount,
      refund_amount: refundAmount,
      refund_percentage: refundPercentage,
      status: refundAmount > 0 ? 'pending_payout' : 'no_refund',
      created_at: new Date().toISOString()
    }]);

  // Free up seats
  if (bookingData.seats && Array.isArray(bookingData.seats)) {
    await supabase
      .from('seat_locks')
      .delete()
      .eq('trip_id', bookingData.trip_id)
      .in('seat_id', bookingData.seats);
  }

  // Record audit log
  await logAudit(
    'BOOKING_CANCELLED',
    'booking',
    bookingId,
    { refundId, refundAmount, refundPercentage },
    authenticatedUser?.uid || 'guest',
    authenticatedUser?.role || 'Guest'
  );

  return {
    success: true,
    refundPercentage,
    refundAmount,
    refundId,
    message: refundAmount > 0
      ? `Booking cancelled successfully. You are eligible for a ${refundPercentage}% refund (Rs. ${refundAmount.toFixed(2)}).`
      : 'Booking cancelled successfully. No refund is available within 12 hours of departure.'
  };
  */
}

/**
 * Handles PayHere Server-to-Server webhook with strict signature validation, currency, amount check & idempotency.
 */
export async function processPayHereNotification(params: PaymentNotificationParams) {
  const { merchantId, orderId, paymentId, payhereAmount, payhereCurrency, statusCode, md5sig } = params;

  const expectedMerchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || '';
  const merchantSecret = process.env.PAYHERE_SECRET || '';

  if (merchantId !== expectedMerchantId) {
    throw new HttpError(400, 'Merchant ID mismatch');
  }

  // PayHere signature verification
  const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
  const hashString = `${merchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${hashedSecret}`;
  const localHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

  if (localHash !== md5sig) {
    throw new HttpError(400, 'Payment signature verification failed.');
  }

  if (payhereCurrency !== 'LKR') {
    throw new HttpError(400, 'Currency mismatch. Only LKR payments are supported.');
  }

  const supabase = getSupabaseAdminClient();
  const parsedAmount = parseFloat(payhereAmount);

  // 1. Try PostgreSQL atomic stored procedure
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_payment_webhook_atomic', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount: parsedAmount,
      p_currency: payhereCurrency,
      p_status_code: statusCode,
      p_raw_payload: params as unknown as Json
    });

    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
      const res = rpcResult as { success: boolean; status?: string; message?: string; reason?: string };
      if (!res.success) {
        if (res.reason === 'amount_mismatch') {
          throw new HttpError(400, 'Payment amount mismatch. Potential tampering detected.');
        }
        if (res.reason === 'booking_not_found') {
          throw new HttpError(404, `Booking #${orderId} was not found.`);
        }
        return { success: false, message: res.message || 'Payment processing failed', bookingId: orderId, status: res.status || 'failed' };
      }
      return { success: true, message: res.message || 'Payment confirmed', bookingId: orderId, status: res.status || 'confirmed' };
    }
  } catch (rpcErr) {
    if (rpcErr instanceof HttpError) throw rpcErr;
  }

  // Fail closed if the atomic payment transaction is unavailable. A payment
  // webhook must never partially update booking, payment, and seat state.
  throw new HttpError(503, 'Payment processing service is temporarily unavailable. Please retry the notification.');

  /*
  // Legacy non-atomic fallback intentionally disabled.
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (bookingError || !booking) {
    throw new HttpError(404, `Booking #${orderId} was not found.`);
  }

  // Idempotency: If already confirmed, don't duplicate processing
  if (booking.status === 'confirmed') {
    return { success: true, message: 'Booking already confirmed previously', bookingId: orderId, status: 'confirmed' };
  }

  // Strict Authoritative Amount Validation
  if (Math.abs(parsedAmount - Number(booking.total_amount)) >= 0.01) {
    await logAudit(
      'PAYMENT_AMOUNT_MISMATCH',
      'booking',
      orderId,
      { expected: booking.total_amount, received: parsedAmount, paymentId },
      'payhere_webhook',
      'system'
    );
    throw new HttpError(400, 'Payment amount mismatch. Potential tampering detected.');
  }

  // Status code 2 = Success in PayHere
  if (statusCode === '2') {
    await supabase
      .from('bookings')
      .update({
        status: 'confirmed',
        payment_id: paymentId,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    await supabase
      .from('payments')
      .upsert([{
        id: paymentId || `PAY-${orderId}`,
        booking_id: orderId,
        order_id: orderId,
        amount: parsedAmount,
        currency: payhereCurrency,
        status: 'completed',
        provider: 'payhere',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (booking.seats && Array.isArray(booking.seats)) {
      const bookedRecords = booking.seats.map((seatId: string) => ({
        trip_id: booking.trip_id,
        seat_id: seatId,
        user_id: booking.user_id || 'guest',
        booking_id: orderId,
        status: 'booked' as const,
        created_at: new Date().toISOString(),
        expires_at: null
      }));

      await supabase
        .from('seat_locks')
        .upsert(bookedRecords, { onConflict: 'trip_id,seat_id' });
    }

    await logAudit(
      'PAYMENT_CONFIRMED',
      'booking',
      orderId,
      { amount: parsedAmount, paymentId },
      'payhere_webhook',
      'system'
    );

    return { success: true, message: 'Payment successfully processed and booking confirmed', bookingId: orderId, status: 'confirmed' };
  } else {
    await supabase
      .from('bookings')
      .update({
        status: 'payment_failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId);

    if (booking.seats && Array.isArray(booking.seats)) {
      await supabase
        .from('seat_locks')
        .delete()
        .eq('trip_id', booking.trip_id)
        .eq('booking_id', orderId)
        .eq('status', 'locked');
    }

    await logAudit(
      'PAYMENT_FAILED',
      'booking',
      orderId,
      { statusCode, amount: parsedAmount },
      'payhere_webhook',
      'system'
    );

    return { success: false, message: `Payment failed with status code ${statusCode}`, bookingId: orderId, status: 'payment_failed' };
  }
  */
}

export const confirmBookingPayment = processPayHereNotification;

/**
 * Atomically checks and boards a passenger with anti-duplicate verification & trip staff authorization.
 */
export async function atomicBoardTicket(bookingId: string, staffUser: AuthenticatedUser) {
  const supabase = getSupabaseAdminClient();

  // Try PostgreSQL atomic RPC function
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('board_passenger_atomic', {
      p_booking_id: bookingId,
      p_conductor_id: staffUser.uid
    });

    if (!rpcError && rpcResult && typeof rpcResult === 'object') {
      const res = rpcResult as {
        success: boolean;
        reason?: string;
        message?: string;
        boarded_at?: string;
        boarded_by?: string;
      };

      if (!res.success) {
        return {
          success: false,
          reason: res.reason?.toUpperCase() || 'REJECTED',
          message: res.message || 'Boarding rejected',
          boardedAt: res.boarded_at ? new Date(res.boarded_at).getTime() : undefined
        };
      }

      return {
        success: true,
        message: res.message || 'Passenger successfully checked in & boarded',
        boardedAt: res.boarded_at ? new Date(res.boarded_at).getTime() : Date.now()
      };
    }
  } catch {
    // Fall back to direct query with assignment check
  }

  // Fail closed if the atomic boarding primitive is unavailable. A read followed
  // by a conditional write is not a sufficient replacement for a transaction.
  return { success: false, reason: 'TRANSACTION_UNAVAILABLE', message: 'Boarding service is temporarily unavailable. Please retry.' };

  /*
  // Legacy non-atomic fallback intentionally disabled.
  const { data: booking, error: findError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  if (findError || !booking) {
    return { success: false, reason: 'NOT_FOUND', message: 'Booking reference not found.' };
  }

  // Verify staff authorization for this trip
  if (!staffUser.isAdmin && booking.owner_id !== staffUser.uid) {
    const { data: assignment } = await supabase
      .from('staff_trip_assignments')
      .select('id')
      .eq('trip_id', booking.trip_id)
      .eq('staff_id', staffUser.uid)
      .maybeSingle();

    if (!assignment) {
      return {
        success: false,
        reason: 'UNAUTHORIZED_STAFF',
        message: 'Staff member is not assigned to this trip schedule.'
      };
    }
  }

  if (booking.status === 'cancelled') {
    return { success: false, reason: 'CANCELLED', message: 'This ticket was cancelled and refunded.' };
  }

  if (booking.status !== 'confirmed' && booking.status !== 'boarded') {
    return { success: false, reason: 'UNCONFIRMED', message: 'This booking is unpaid or pending.' };
  }

  if (booking.boarded) {
    return {
      success: false,
      reason: 'ALREADY_BOARDED',
      message: 'This passenger has already boarded the bus.',
      boardedAt: booking.boarded_at ? new Date(booking.boarded_at).getTime() : undefined
    };
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('bookings')
    .update({
      boarded: true,
      boarded_at: nowIso,
      boarded_by: staffUser.uid,
      status: 'boarded',
      updated_at: nowIso
    })
    .eq('id', bookingId)
    .eq('boarded', false);

  if (updateError) {
    return { success: false, reason: 'CONFLICT', message: 'Boarding conflict. Please rescan.' };
  }

  await logAudit(
    'PASSENGER_BOARDED',
    'booking',
    bookingId,
    { tripId: booking.trip_id, seats: booking.seats },
    staffUser.uid,
    'Conductor'
  );

  return {
    success: true,
    message: 'Passenger checked in and marked as boarded.',
    boardedAt: Date.now()
  };
}
