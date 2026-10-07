import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { DEFAULT_CURRENCY } from '@/lib/constants';

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

    // 4. Strict State Machine: Payment hash can ONLY be generated for pending reservations
    if (booking.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot initiate payment for booking with status '${booking.status}'. Only pending reservations can be paid.` },
        { status: 400 }
      );
    }

    // 5. Booking Authorization Check
    const authUser = await getAuthenticatedUser(req);
    if (booking.user_id) {
      if (!authUser || (authUser.uid !== booking.user_id && authUser.role !== 'Admin')) {
        return NextResponse.json(
          { error: 'Access denied: You do not have permission to pay for this reservation.' },
          { status: 403 }
        );
      }
    } else {
      // Guest booking: If an accessToken was passed, verify authenticity
      if (accessToken) {
        const providedHash = crypto.createHash('sha256').update(accessToken).digest('hex');
        const storedHash = (booking as Record<string, unknown>).access_token_hash as string | undefined;
        const storedToken = booking.access_token;
        const matches =
          (storedHash && (storedHash === providedHash || storedHash === accessToken)) ||
          (storedToken && (storedToken === accessToken || storedToken === providedHash));

        if (!matches) {
          return NextResponse.json({ error: 'Invalid access token for this guest reservation.' }, { status: 403 });
        }
      }
    }

    // 6. Authoritative amount derived directly from server record
    const amount = Number(booking.total_amount);
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