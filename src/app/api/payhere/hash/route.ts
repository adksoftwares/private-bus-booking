import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { DEFAULT_CURRENCY } from '@/lib/constants';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting
    await enforceRateLimit(req, 'payhere_hash', 30, 60);

    const body = await req.json();
    const { orderId } = body;

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

    // 3. Fetch authoritative booking from Supabase using Admin client
    const supabase = getSupabaseAdminClient();
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found for orderId' }, { status: 404 });
    }

    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Cannot initiate payment for booking with status '${booking.status}'` },
        { status: 400 }
      );
    }

    // 4. Authoritative amount derived directly from server record
    const amount = Number(booking.total_amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid booking ticket amount' }, { status: 400 });
    }

    const currency = DEFAULT_CURRENCY; // LKR
    const formattedAmount = amount.toFixed(2);

    // 5. Official PayHere MD5 Hash generation:
    // md5sig = strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(payhere_secret))))
    const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
    const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
    const finalHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    return NextResponse.json({
      hash: finalHash,
      merchantId,
      amount: formattedAmount,
      currency,
      orderId
    });

  } catch (err: unknown) {
    const error = err as Error;
    console.error("PayHere hash generation error:", error);
    return NextResponse.json(
      { error: error.message || 'Internal error calculating payment hash.' },
      { status: 500 }
    );
  }
}