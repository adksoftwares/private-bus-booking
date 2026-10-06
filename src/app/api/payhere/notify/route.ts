import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';

export async function POST(req: Request) {
  try {
    // PayHere sends form-urlencoded data
    const formData = await req.formData();
    
    const merchant_id = formData.get('merchant_id')?.toString() || '';
    const order_id = formData.get('order_id')?.toString() || '';
    const payment_id = formData.get('payment_id')?.toString() || '';
    const payhere_amount = formData.get('payhere_amount')?.toString() || '';
    const payhere_currency = formData.get('payhere_currency')?.toString() || '';
    const status_code = formData.get('status_code')?.toString() || '';
    const md5sig = formData.get('md5sig')?.toString() || '';

    const secret = process.env.PAYHERE_SECRET;
    const configuredMerchantId = process.env.NEXT_PUBLIC_PAYHERE_MERCHANT_ID || process.env.PAYHERE_MERCHANT_ID;

    if (!secret || !configuredMerchantId) {
      console.error("PayHere IPN Error: Server missing PAYHERE_SECRET or MERCHANT_ID");
      return new NextResponse('Configuration error', { status: 500 });
    }

    // 1. Verify merchant identity
    if (merchant_id !== configuredMerchantId) {
      console.error(`PayHere IPN Error: Merchant ID mismatch (received ${merchant_id}, expected ${configuredMerchantId})`);
      return new NextResponse('Merchant mismatch', { status: 400 });
    }

    // 2. Verify official PayHere MD5 checksum:
    // md5sig = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(payhere_secret))))
    const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
    const hashString = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
    const localHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

    if (localHash !== md5sig) {
      console.error(`PayHere IPN Error: Signature verification failed for order ${order_id}`);
      return new NextResponse('Hash verification failed', { status: 400 });
    }

    const db = getServerDatabase();
    const bookingRef = child(ref(db), `bookings/${order_id}`);
    const bookingSnap = await get(bookingRef);

    if (!bookingSnap.exists()) {
      console.error(`PayHere IPN Error: Booking not found for order ${order_id}`);
      return new NextResponse('Booking not found', { status: 404 });
    }

    const booking = bookingSnap.val();
    const now = Date.now();

    // 3. Process Status Code
    if (status_code === '2') {
      // Success
      // Check idempotency: If already confirmed, don't duplicate operations
      if (booking.status === 'confirmed' || booking.status === 'boarded') {
        return new NextResponse('Already processed', { status: 200 });
      }

      const updates: Record<string, unknown> = {};

      // Update booking to confirmed
      updates[`bookings/${order_id}/status`] = 'confirmed';
      updates[`bookings/${order_id}/paymentId`] = payment_id;
      updates[`bookings/${order_id}/updatedAt`] = now;

      // Duplicate to tickets/ node for redundancy
      updates[`tickets/${order_id}`] = {
        ...booking,
        status: 'confirmed',
        paymentId: payment_id,
        updatedAt: now
      };

      // Convert seat locks to permanent 'booked'
      if (Array.isArray(booking.seats)) {
        booking.seats.forEach((seatId: string) => {
          updates[`seatLocks/${booking.tripId}/${seatId}`] = {
            userId: booking.userId || 'guest',
            status: 'booked',
            bookingId: order_id
          };
        });
      }

      // Record successful payment log
      updates[`payments/${order_id}`] = {
        orderId: order_id,
        paymentId: payment_id,
        amount: parseFloat(payhere_amount),
        currency: payhere_currency,
        status: 'success',
        timestamp: now
      };

      await update(ref(db), updates);
      console.log(`[PayHere IPN] Booking ${order_id} successfully confirmed via IPN webhook.`);
      return new NextResponse('Payment processed successfully', { status: 200 });

    } else if (status_code === '-1' || status_code === '-2') {
      // -1 = Canceled, -2 = Failed
      const updates: Record<string, unknown> = {};
      updates[`bookings/${order_id}/status`] = 'payment_failed';
      updates[`bookings/${order_id}/updatedAt`] = now;

      // Release seat locks so other passengers can select them
      if (Array.isArray(booking.seats)) {
        booking.seats.forEach((seatId: string) => {
          updates[`seatLocks/${booking.tripId}/${seatId}`] = null;
        });
      }

      await update(ref(db), updates);
      console.log(`[PayHere IPN] Booking ${order_id} marked as failed/canceled.`);
      return new NextResponse('Handled failed payment', { status: 200 });

    } else {
      // 0 = Pending, -3 = Chargedback, etc.
      console.log(`[PayHere IPN] Booking ${order_id} received status_code ${status_code}`);
      return new NextResponse(`Status ${status_code} acknowledged`, { status: 200 });
    }

  } catch (error: unknown) {
    console.error("PayHere IPN Processing Error:", error);
    const err = error as Error;
    return new NextResponse(err.message || 'Internal error', { status: 500 });
  }
}
