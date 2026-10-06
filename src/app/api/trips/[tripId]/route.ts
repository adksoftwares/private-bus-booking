import { NextResponse } from 'next/server';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';
import { Trip } from '@/types/trip';

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const db = getServerDatabase();
    const tripSnap = await get(child(ref(db), `trips/${tripId}`));

    if (!tripSnap.exists()) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    return NextResponse.json({ trip: { id: tripId, ...tripSnap.val() } });
  } catch (err: unknown) {
    console.error("GET /api/trips/[tripId] error:", err);
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const body = await req.json();
    const { status, farePerSeat, departureTime, arrivalTime, userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const db = getServerDatabase();
    const tripSnap = await get(child(ref(db), `trips/${tripId}`));
    if (!tripSnap.exists()) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const trip: Trip = tripSnap.val();

    // Check permissions
    const userSnap = await get(child(ref(db), `users/${userId}`));
    const isAdmin = userSnap.exists() && userSnap.val().role === 'Admin';
    if (!isAdmin && trip.ownerId !== userId) {
      return NextResponse.json({ error: 'Access denied. You do not own this trip.' }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    const now = Date.now();

    if (status && ['scheduled', 'cancelled', 'departed', 'completed'].includes(status)) {
      updates[`trips/${tripId}/status`] = status;
    }

    if (farePerSeat !== undefined && farePerSeat !== null) {
      const newFare = Number(farePerSeat);
      if (isNaN(newFare) || newFare <= 0) {
        return NextResponse.json({ error: 'Invalid fare per seat' }, { status: 400 });
      }
      updates[`trips/${tripId}/baseFare`] = newFare;
      updates[`trips/${tripId}/farePerSeat`] = newFare;
    }

    if (departureTime && /^\d{2}:\d{2}$/.test(departureTime)) {
      updates[`trips/${tripId}/departureTime`] = departureTime;
    }

    if (arrivalTime && /^\d{2}:\d{2}$/.test(arrivalTime)) {
      updates[`trips/${tripId}/arrivalTime`] = arrivalTime;
    }

    updates[`trips/${tripId}/updatedAt`] = now;

    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    await update(ref(db), sanitizedUpdates);

    return NextResponse.json({ success: true, tripId });
  } catch (err: unknown) {
    console.error("PATCH /api/trips/[tripId] error:", err);
    return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
  }
}
