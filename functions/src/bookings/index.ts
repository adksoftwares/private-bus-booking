import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const cancelBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");

  const { bookingId } = data;
  const uid = context.auth.uid;
  const db = admin.database();

  try {
    const bookingRef = db.ref(`bookings/${bookingId}`);
    const bookingSnap = await bookingRef.once("value");

    if (!bookingSnap.exists()) {
      throw new functions.https.HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnap.val();

    // Ensure the user owns this booking
    if (booking.userId !== uid) {
      throw new functions.https.HttpsError("permission-denied", "You can only cancel your own bookings.");
    }
    
    if (booking.status === 'cancelled') {
      throw new functions.https.HttpsError("failed-precondition", "Booking is already cancelled.");
    }

    // Fetch trip to get departure time
    const tripSnap = await db.ref(`trips/${booking.tripId}`).once("value");
    const trip = tripSnap.val();

    if (!trip) throw new functions.https.HttpsError("internal", "Trip data missing.");

    // Compute time difference
    const departureDateTime = new Date(`${trip.departureDate}T${trip.departureTime}:00`);
    const now = new Date();
    const diffHours = (departureDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    let refundPercentage = 0;
    if (diffHours > 24) {
      refundPercentage = 100;
    } else if (diffHours >= 12) {
      refundPercentage = 50;
    } else {
      refundPercentage = 0;
    }

    const originalTicketAmount = booking.fares?.ticketAmount || 0;
    const refundAmount = (originalTicketAmount * refundPercentage) / 100;

    const updates: any = {};
    
    // Update booking status
    updates[`bookings/${bookingId}/status`] = "cancelled";
    
    // Add refund record
    const refundId = `RF-${Date.now()}`;
    updates[`refunds/${refundId}`] = {
      bookingId,
      userId: uid,
      originalAmount: originalTicketAmount,
      refundAmount,
      refundPercentage,
      status: refundAmount > 0 ? "pending_payout" : "no_refund",
      createdAt: admin.database.ServerValue.TIMESTAMP
    };

    updates[`bookings/${bookingId}/refundId`] = refundId;

    // Free up the seats by removing the locks/bookings
    if (booking.seats && Array.isArray(booking.seats)) {
      booking.seats.forEach((seatId: string) => {
        updates[`seatLocks/${booking.tripId}/${seatId}`] = null;
      });
    }

    // Adjust revenue (subtract from owner net) - For MVP we assume standard reconciliation later
    // Just save the refund record for Admin to process

    await db.ref().update(updates);

    return { 
      success: true, 
      refundPercentage, 
      refundAmount, 
      message: refundAmount > 0 ? `Booking cancelled. You are eligible for a ${refundPercentage}% refund.` : `Booking cancelled. No refund available.`
    };
    
  } catch (error: any) {
    console.error("Cancellation Error:", error);
    throw new functions.https.HttpsError("internal", error.message || "Failed to cancel booking.");
  }
});
