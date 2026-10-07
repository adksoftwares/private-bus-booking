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
  orderId?: string
): Promise<{ success: boolean; conflictingSeat?: string }> {
  if (!seatIds || seatIds.length === 0) {
    return { success: false };
  }

  if (seatIds.length > MAX_SEATS_PER_BOOKING) {
    return { success: false, conflictingSeat: seatIds[MAX_SEATS_PER_BOOKING] };
  }

  const supabase = getSupabaseAdminClient();

  const { data: rpcResult, error: rpcError } = await supabase.rpc('lock_seats_atomic', {
    p_trip_id: tripId,
    p_seat_ids: seatIds,
    p_user_id: effectiveUserId,
    p_booking_id: orderId || null,
    p_duration_seconds: Math.floor(SEAT_LOCK_DURATION_MS / 1000)
  });

  if (rpcError) {
    console.error('lock_seats_atomic RPC error:', rpcError);
    return { success: false, conflictingSeat: seatIds[0] };
  }

  if (rpcResult && typeof rpcResult === 'object') {
    const res = rpcResult as { success: boolean; conflicting_seat?: string };
    if (!res.success) {
      return { success: false, conflictingSeat: res.conflicting_seat };
    }
    return { success: true };
  }

  return { success: false, conflictingSeat: seatIds[0] };
}

/**
 * Creates a pending booking with atomic seat reservation and authoritative pricing
 * executed within a SINGLE ACID PostgreSQL transaction via create_pending_booking_atomic.
 */
export async function createPendingBooking(params: CreateBookingParams) {
  const { tripId, selectedSeats, passengerDetails, authenticatedUser } = params;
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

  // 2. Generate secure cryptographically random identifiers
  const orderId = `BK-${crypto.randomUUID()}`;
  const bookingReference = generateBookingReference();
  const rawAccessToken = crypto.randomBytes(32).toString('hex');
  const accessTokenHash = crypto.createHash('sha256').update(rawAccessToken).digest('hex');
  const bookingType: BookingType = authenticatedUser ? 'account' : 'guest';

  // 3. Authoritative Single ACID Transaction: Lock seats + Insert booking record atomically
  const { data: rpcResult, error: rpcError } = await supabase.rpc('create_pending_booking_atomic', {
    p_order_id: orderId,
    p_booking_reference: bookingReference,
    p_access_token_hash: accessTokenHash,
    p_booking_type: bookingType,
    p_trip_id: tripId,
    p_user_id: authenticatedUser?.uid || null,
    p_passenger_name: passengerDetails.name.trim(),
    p_passenger_phone: passengerDetails.phone.trim(),
    p_passenger_email: passengerDetails.email?.trim() || null,
    p_passenger_details: {
      name: passengerDetails.name.trim(),
      phone: passengerDetails.phone.trim(),
      email: passengerDetails.email?.trim() || '',
      uid: authenticatedUser?.uid || null
    },
    p_seat_ids: selectedSeats,
    p_duration_seconds: Math.floor(SEAT_LOCK_DURATION_MS / 1000),
    p_guest_session_id: params.guestSessionId || null
  });

  if (rpcError) {
    console.error('create_pending_booking_atomic RPC error:', rpcError);
    throw new HttpError(500, 'Database transaction failed while creating booking reservation.');
  }

  const res = rpcResult as {
    success: boolean;
    reason?: string;
    conflicting_seat?: string;
    message?: string;
    total_amount?: number;
  };

  if (!res || !res.success) {
    if (res?.reason === 'already_booked' || res?.reason === 'currently_held') {
      throw new HttpError(
        409,
        `Seat ${res.conflicting_seat || 'selection'} is no longer available. Please select another seat.`
      );
    }
    throw new HttpError(400, res?.message || 'Failed to create reservation.');
  }

  const authoritativeTotal = Number(res.total_amount);

  // 4. Generate PayHere Checkout Signature
  const merchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || '';
  const merchantSecret = process.env.PAYHERE_SECRET || '';
  const formattedAmount = authoritativeTotal.toFixed(2);
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
    accessToken: rawAccessToken,
    bookingType,
    totalAmount: authoritativeTotal,
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

  const { data, error } = await supabase.rpc('lookup_booking_atomic', {
    p_reference: cleanRef,
    p_access_token: accessToken || null,
    p_caller_user_id: authenticatedUserId || null,
    p_phone: providedPhone || null,
  });

  if (error) {
    console.error('lookup_booking_atomic error:', error);
    throw new HttpError(500, error.message || 'Failed to lookup booking');
  }

  if (!data || !data.success) {
    if (data?.reason === 'not_found') {
      throw new HttpError(404, data.message || `Booking #${cleanRef} was not found.`);
    }
    if (data?.reason === 'auth_required') {
      throw new HttpError(403, data.message || 'Access verification required. Please verify with the passenger phone number or access token.');
    }
    throw new HttpError(400, data?.message || 'Invalid booking lookup request.');
  }

  const booking = data.booking as unknown as Booking;
  const trip = data.trip as unknown as Trip;

  // Data Minimization: Strip internal financial commissions and operator margins from passenger lookup
  if (booking.fares) {
    booking.fares = {
      ticketAmount: booking.fares.ticketAmount,
      serviceFee: booking.fares.serviceFee,
      total: booking.fares.total || booking.totalAmount,
    };
  }

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
  const providedHash = accessToken ? crypto.createHash('sha256').update(accessToken).digest('hex') : null;
  const storedHash = (booking as Record<string, unknown>).access_token_hash as string | undefined;
  const storedToken = booking.access_token;

  const isTokenMatch = Boolean(
    accessToken && (
      (storedHash && (storedHash === providedHash || storedHash === accessToken)) ||
      (storedToken && (storedToken === accessToken || storedToken === providedHash))
    )
  );

  if (!accessToken || !isTokenMatch) {
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
 * Cancels a booking, computes eligible refunds, and frees up seats atomically via cancel_booking_atomic.
 * Requires authenticated account ownership, admin privileges, or cryptographic access token.
 */
export async function cancelBooking(
  bookingId: string,
  authenticatedUser: AuthenticatedUser | null,
  accessToken?: string
) {
  const supabase = getSupabaseAdminClient();
  const tokenHash = accessToken ? crypto.createHash('sha256').update(accessToken).digest('hex') : undefined;

  const { data: rpcResult, error: rpcError } = await supabase.rpc('cancel_booking_atomic', {
    p_booking_id: bookingId,
    p_caller_id: authenticatedUser?.uid || null,
    p_access_token_hash: tokenHash || accessToken || null,
    p_is_admin: authenticatedUser?.isAdmin || false
  });

  if (rpcError) {
    console.error('cancel_booking_atomic RPC error:', rpcError);
    throw new HttpError(500, 'Database transaction failed while cancelling booking.');
  }

  if (rpcResult && typeof rpcResult === 'object') {
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
      if (res.reason === 'already_boarded') throw new HttpError(400, 'Cannot cancel a journey after passenger has boarded.');
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

  throw new HttpError(500, 'Unexpected cancellation response from database.');
}

/**
 * Handles PayHere Server-to-Server webhook with strict signature validation, currency, amount check & idempotency.
 * Authoritatively executes inside PostgreSQL via process_payment_webhook_atomic.
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

  // Authoritative PostgreSQL atomic transaction
  const { data: rpcResult, error: rpcError } = await supabase.rpc('process_payment_webhook_atomic', {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount: parsedAmount,
    p_currency: payhereCurrency,
    p_status_code: statusCode,
    p_raw_payload: params as unknown as Json
  });

  if (rpcError) {
    console.error('process_payment_webhook_atomic RPC error:', rpcError);
    throw new HttpError(500, 'Payment processing transaction failed.');
  }

  if (rpcResult && typeof rpcResult === 'object') {
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

  throw new HttpError(500, 'Unexpected response from payment processor.');
}

export const confirmBookingPayment = processPayHereNotification;

/**
 * Atomically checks and boards a passenger with anti-duplicate verification & trip staff authorization
 * executed inside PostgreSQL via board_passenger_atomic.
 */
export async function atomicBoardTicket(bookingId: string, staffUser: AuthenticatedUser) {
  const supabase = getSupabaseAdminClient();

  const { data: rpcResult, error: rpcError } = await supabase.rpc('board_passenger_atomic', {
    p_booking_id: bookingId,
    p_conductor_id: staffUser.uid
  });

  if (rpcError) {
    console.error('board_passenger_atomic RPC error:', rpcError);
    return { success: false, reason: 'RPC_ERROR', message: 'Boarding transaction failed in database.' };
  }

  if (rpcResult && typeof rpcResult === 'object') {
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

  return { success: false, reason: 'UNKNOWN_ERROR', message: 'Unexpected database response.' };
}
