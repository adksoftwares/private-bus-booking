import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

const PAYHERE_MERCHANT_ID = process.env.PAYHERE_MERCHANT_ID || "TEST_MERCHANT_ID";
const PAYHERE_MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || "TEST_MERCHANT_SECRET";

// Function to generate hash for PayHere client-side checkout
export const generatePaymentHash = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { orderId, amount, currency = "LKR" } = data;
  
  // PayHere Hash generation logic:
  // md5sig = strtoupper (md5 ( merchant_id + order_id + amount + currency + strtoupper(md5(payhere_secret)) ) )
  // Note: amount must be formatted to 2 decimal places e.g. "1000.00"
  
  const formattedAmount = parseFloat(amount).toFixed(2);
  
  const hashedSecret = crypto.createHash('md5').update(PAYHERE_MERCHANT_SECRET).digest('hex').toUpperCase();
  const hashString = `${PAYHERE_MERCHANT_ID}${orderId}${formattedAmount}${currency}${hashedSecret}`;
  const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

  return { hash, merchantId: PAYHERE_MERCHANT_ID, formattedAmount, currency };
});

// Webhook endpoint called by PayHere on payment success
export const payhereWebhook = functions.https.onRequest(async (req, res) => {
  // PayHere sends form-urlencoded data POST
  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
    custom_1 // We can pass tripId or booking payload here
  } = req.body;

  // Verify hash to ensure it's actually from PayHere
  const hashedSecret = crypto.createHash('md5').update(PAYHERE_MERCHANT_SECRET).digest('hex').toUpperCase();
  const hashString = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
  const localHash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();

  if (localHash !== md5sig) {
    console.error("Payment Hash verification failed.");
    res.status(400).send("Hash mismatch");
    return;
  }

  if (status_code === "2") { // 2 = Success
    try {
      const db = admin.database();
      
      // Look up pending booking from our database using order_id
      // For MVP, we assume custom_1 contains a JSON string of booking draft
      const bookingData = JSON.parse(custom_1);
      const { tripId, selectedSeats, passengerDetails, ownerId } = bookingData;
      
      const ticketAmount = parseFloat(payhere_amount);
      const commissionRate = 0.10; // 10% platform commission
      const platformCommission = ticketAmount * commissionRate;
      const gatewayFee = ticketAmount * 0.03; // ~3% gateway fee
      const ownerNetAmount = ticketAmount - platformCommission - gatewayFee;

      const newBookingId = order_id; // e.g. BK-2026-12345
      
      const finalBooking = {
        userId: passengerDetails.uid,
        tripId,
        ownerId,
        seats: selectedSeats,
        passengerDetails,
        paymentId: order_id,
        status: 'confirmed',
        fares: {
          ticketAmount,
          platformCommission,
          gatewayFee,
          ownerNetAmount
        },
        createdAt: admin.database.ServerValue.TIMESTAMP
      };

      const updates: any = {};
      // Save booking
      updates[`bookings/${newBookingId}`] = finalBooking;
      
      // Map to indexes
      updates[`indexes/tripBookings/${tripId}/${newBookingId}`] = true;
      updates[`indexes/userBookings/${passengerDetails.uid}/${newBookingId}`] = true;
      updates[`indexes/ownerBookings/${ownerId}/${newBookingId}`] = true;

      // Convert seat locks to 'booked' state indefinitely
      selectedSeats.forEach((seatId: string) => {
        updates[`seatLocks/${tripId}/${seatId}`] = {
          userId: passengerDetails.uid,
          status: 'booked',
          bookingId: newBookingId
        };
      });

      // Save payment record
      updates[`payments/${newBookingId}`] = {
        amount: ticketAmount,
        currency: payhere_currency,
        status: 'success',
        timestamp: admin.database.ServerValue.TIMESTAMP
      };

      await db.ref().update(updates);
      
      res.status(200).send("Payment processed successfully.");
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).send("Internal error");
    }
  } else {
    // Payment failed or pending
    res.status(200).send("Ignored non-success status");
  }
});
