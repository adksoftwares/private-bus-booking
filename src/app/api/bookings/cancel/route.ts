import { NextResponse } from 'next/server';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { bookingId, userId, accessToken, phone } = body;

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId is required' }, { status: 400 });
    }

    const db = getServerDatabase();
    const bookingSnap = await get(child(ref(db), `bookings/${bookingId}`));
    if (!bookingSnap.exists()) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const booking = bookingSnap.val();

    // Check authorization:
    let isAuthorized = false;

    if (userId) {
      const userSnap = await get(child(ref(db), `users/${userId}`));
      const userRole = userSnap.exists() ? userSnap.val().role : null;
      const isPrivileged = userRole === 'Admin' || userRole === 'Owner';
      if (booking.userId === userId || isPrivileged) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && accessToken && booking.accessToken === accessToken) {
      isAuthorized = true;
    }

    if (!isAuthorized && phone && booking.passengerPhone) {
      const p1 = phone.replace(/[^0-9]/g, '');
      const p2 = booking.passengerPhone.replace(/[^0-9]/g, '');
      if (p1 && p2 && (p1 === p2 || p1.endsWith(p2) || p2.endsWith(p1))) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized: You can only cancel your own bookings' }, { status: 403 });
    }

    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'This booking is already cancelled' }, { status: 400 });
    }

    if (booking.boarded || booking.status === 'boarded') {
      return NextResponse.json({ error: 'Cannot cancel a ticket that has already been boarded' }, { status: 400 });
    }

    // Fetch trip schedule for refund calculation
    const tripSnap = await get(child(ref(db), `trips/${booking.tripId}`));
    let refundPercentage = 0;
    const now = Date.now();

    if (tripSnap.exists()) {
      const trip = tripSnap.val();
      if (trip.departureDate && trip.departureTime) {
        const departureTimeStr = `${trip.departureDate}T${trip.departureTime}:00`;
        const departureDate = new Date(departureTimeStr);
        const diffHours = (departureDate.getTime() - now) / (1000 * 60 * 60);

        if (diffHours > 24) {
          refundPercentage = 100;
        } else if (diffHours >= 12) {
          refundPercentage = 50;
        } else {
          refundPercentage = 0;
        }
      }
    }

    const originalAmount = Number(booking.fares?.ticketAmount || booking.totalAmount || 0);
    const refundAmount = (originalAmount * refundPercentage) / 100;
    const refundId = `RF-${Date.now()}`;

    const updates: Record<string, unknown> = {};
    updates[`bookings/${bookingId}/status`] = 'cancelled';
    updates[`bookings/${bookingId}/cancelledAt`] = now;
    updates[`bookings/${bookingId}/refundId`] = refundId;

    if (bookingSnap.exists()) {
      updates[`tickets/${bookingId}/status`] = 'cancelled';
      updates[`tickets/${bookingId}/cancelledAt`] = now;
    }

    // Record refund record
    updates[`refunds/${refundId}`] = {
      id: refundId,
      bookingId,
      userId: booking.userId,
      originalAmount,
      refundAmount,
      refundPercentage,
      status: refundAmount > 0 ? 'pending_payout' : 'no_refund',
      createdAt: now
    };

    // Release all booked seats
    if (Array.isArray(booking.seats)) {
      booking.seats.forEach((seatId: string) => {
        updates[`seatLocks/${booking.tripId}/${seatId}`] = null;
      });
    }

    await update(ref(db), updates);

    return NextResponse.json({
      success: true,
      refundPercentage,
      refundAmount,
      message: refundAmount > 0 
        ? `Booking cancelled successfully. You are eligible for a ${refundPercentage}% refund (Rs. ${refundAmount.toFixed(2)}).`
        : 'Booking cancelled. According to policy, no refund is eligible within 12 hours of departure.'
    });

  } catch (error: unknown) {
    console.error("Cancel booking error:", error);
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
