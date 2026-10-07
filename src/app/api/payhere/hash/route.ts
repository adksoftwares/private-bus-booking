import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { DEFAULT_CURRENCY } from '@/lib/constants';
import { lookupBookingByReference } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting
    enforceRateLimit(req, 'payhere_hash', 30, 60);

    const body = await req.json();
    const { orderId, accessToken } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Valid orderId is required' }, { status: 400 });
    }

    // 2. Validate environment configuration
    const merchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || process.env.PAYHERE_MERCHANT_ID;
    const secret = process.env.PAYHERE_SECRET;

    if (!merchantId || !secret) {
      console.error("Missing PayHere configuration: NEXT_PUBLIC_PAYHERE_MERCHANT_ID or PAYHERE_SECRET not set.");
      return NextResponse.json(
        { error: 'Payment gateway configuration is missing. Please contact administrator.' },
        { status: 500 }
      );
    }

    // 3. Authenticate caller server-side
    const authUser = await getAuthenticatedUser(req);

    // 4. Fetch authoritative booking and verify authorization via secure atomic lookup
    let booking;
    try {
      const result = await lookupBookingByReference(orderId, accessToken, authUser?.uid);
      booking = result.booking;
    } catch (lookupErr: unknown) {
      const err = lookupErr as { statusCode?: number; message?: string };
      const status = err.statusCode || 404;
      return NextResponse.json({ error: err.message || 'Booking not found for orderId' }, { status });
    }

    // 5. Strict State Machine: Payment hash can ONLY be generated for pending reservations
    if (booking.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot initiate payment for booking with status '${booking.status}'. Only pending reservations can be paid.` },
        { status: 400 }
      );
    }

    // 6. Authoritative amount derived directly from server record
    const amount = Number(booking.totalAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid booking ticket amount' }, { status: 400 });
    }

    const currency = DEFAULT_CURRENCY; // LKR
    const formattedAmount = amount.toFixed(2);

    // 7. Official PayHere MD5 Hash generation:
    // md5sig = strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(payhere_secret))))
    const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
    const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
    const finalHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    return NextResponse.json({
      hash: finalHash,
      merchantId,
      amount: formattedAmount,
      formattedAmount,
      currency,
      orderId
    });

  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number; message?: string };
    const statusCode = errorObj.statusCode || 500;
    console.error("PayHere hash generation error:", errorObj);
    return NextResponse.json(
      { error: errorObj.message || 'Internal error calculating payment hash.' },
      { status: statusCode }
    );
  }
}