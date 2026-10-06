import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ref, get, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { orderId } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Valid orderId is required' }, { status: 400 });
    }

    // 1. Validate environment configuration (no insecure fallback secrets)
    const merchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || process.env.PAYHERE_MERCHANT_ID;
    const secret = process.env.PAYHERE_SECRET;

    if (!merchantId || !secret) {
      console.error("Missing PayHere configuration: NEXT_PUBLIC_PAYHERE_MERCHANT_ID or PAYHERE_SECRET not set.");
      return NextResponse.json(
        { error: 'Payment gateway configuration is missing. Please contact administrator.' },
        { status: 500 }
      );
    }

    // 2. Fetch authoritative booking from database
    const db = getServerDatabase();
    const bookingSnap = await get(child(ref(db), `bookings/${orderId}`));
    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found for orderId' }, { status: 404 });
    }

    const booking = bookingSnap.val();
    if (booking.status !== 'pending' && booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: `Cannot initiate payment for booking with status '${booking.status}'` },
        { status: 400 }
      );
    }

    // 3. Authoritative amount from database record
    const amount = Number(booking.totalAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid booking amount' }, { status: 400 });
    }

    const currency = "LKR";
    const formattedAmount = amount.toFixed(2);

    // 4. Official PayHere Hash generation logic:
    // md5sig = strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(payhere_secret))))
    const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
    const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
    const finalHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    return NextResponse.json({
      hash: finalHash,
      merchantId,
      formattedAmount,
      currency,
      orderId
    });
  } catch (error: unknown) {
    console.error("PayHere hash generation error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}