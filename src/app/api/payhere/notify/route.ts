import { NextResponse } from 'next/server';
import { confirmBookingPayment } from '@/lib/services/booking-service';

export async function POST(req: Request) {
  try {
    // PayHere sends form-urlencoded data via server-to-server IPN
    const formData = await req.formData();

    const merchant_id = formData.get('merchant_id')?.toString() || '';
    const order_id = formData.get('order_id')?.toString() || '';
    const payment_id = formData.get('payment_id')?.toString() || '';
    const payhere_amount = formData.get('payhere_amount')?.toString() || '';
    const payhere_currency = formData.get('payhere_currency')?.toString() || '';
    const status_code = formData.get('status_code')?.toString() || '';
    const md5sig = formData.get('md5sig')?.toString() || '';

    const result = await confirmBookingPayment({
      merchantId: merchant_id,
      orderId: order_id,
      paymentId: payment_id,
      payhereAmount: payhere_amount,
      payhereCurrency: payhere_currency,
      statusCode: status_code,
      md5sig: md5sig
    });

    console.log(`[PayHere IPN] Order ${order_id} processed with status: ${result.status}`);
    return new NextResponse(`Payment processed: ${result.status}`, { status: 200 });

  } catch (error: unknown) {
    console.error('[PayHere IPN Error]:', error);
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return new NextResponse(err.message || 'Payment processing error', { status });
  }
}
