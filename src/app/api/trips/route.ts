import { NextResponse } from 'next/server';
import { ref, get, update, child } from 'firebase/database';
import { getServerDatabase } from '@/lib/serverFirebase';
import { Trip, BusSnapshot, RouteSnapshot } from '@/types/trip';
import { Bus } from '@/types/bus';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');
    const date = searchParams.get('date');

    const db = getServerDatabase();
    const tripsSnap = await get(ref(db, 'trips'));

    if (!tripsSnap.exists()) {
      return NextResponse.json({ trips: [] });
    }

    const trips: Trip[] = [];
    tripsSnap.forEach((childSnap) => {
      const trip = { id: childSnap.key as string, ...childSnap.val() } as Trip;
      if (ownerId && trip.ownerId !== ownerId) return;
      if (date && trip.departureDate !== date) return;
      trips.push(trip);
    });

    // Sort by departureDate desc, then departureTime asc
    trips.sort((a, b) => {
      if (a.departureDate !== b.departureDate) {
        return b.departureDate.localeCompare(a.departureDate);
      }
      return (a.departureTime || '').localeCompare(b.departureTime || '');
    });

    return NextResponse.json({ trips });
  } catch (err: unknown) {
    console.error("GET /api/trips error:", err);
    const message = err instanceof Error ? err.message : 'Failed to fetch trips';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      busId,
      startCity,
      endCity,
      stops = [],
      departureDate,
      departureTime,
      arrivalTime,
      duration,
      farePerSeat,
      userId
    } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'User ID is required for authentication' }, { status: 401 });
    }

    if (!busId || typeof busId !== 'string') {
      return NextResponse.json({ error: 'A valid bus must be selected' }, { status: 400 });
    }

    if (!startCity?.trim() || !endCity?.trim()) {
      return NextResponse.json({ error: 'Origin and Destination cities are required' }, { status: 400 });
    }

    if (startCity.trim().toLowerCase() === endCity.trim().toLowerCase()) {
      return NextResponse.json({ error: 'Origin and Destination cannot be the same city' }, { status: 400 });
    }

    if (!departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) {
      return NextResponse.json({ error: 'A valid travel date (YYYY-MM-DD) is required' }, { status: 400 });
    }

    if (!departureTime || !/^\d{2}:\d{2}$/.test(departureTime)) {
      return NextResponse.json({ error: 'A valid departure time (HH:MM) is required' }, { status: 400 });
    }

    const fare = Number(farePerSeat);
    if (isNaN(fare) || fare <= 0 || fare > 50000) {
      return NextResponse.json({ error: 'Valid individual ticket fare per seat (1 - 50,000 LKR) is required' }, { status: 400 });
    }

    const db = getServerDatabase();

    // 1. Check user role permissions (Owner or Admin)
    const [userSnap, ownerSnap] = await Promise.all([
      get(child(ref(db), `users/${userId}`)),
      get(child(ref(db), `owners/${userId}`))
    ]);

    const isAdmin = userSnap.exists() && userSnap.val().role === 'Admin';
    const isOwner = (userSnap.exists() && userSnap.val().role === 'Owner') || ownerSnap.exists();

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Access denied. Only registered bus operators or admins can schedule trips.' }, { status: 403 });
    }

    // 2. Fetch the bus to ensure it exists and belongs to the owner
    const busSnap = await get(child(ref(db), `buses/${busId}`));
    if (!busSnap.exists()) {
      return NextResponse.json({ error: 'Selected bus record not found' }, { status: 404 });
    }

    const busData: Bus = busSnap.val();
    if (!isAdmin && busData.ownerId !== userId) {
      return NextResponse.json({ error: 'You do not own this bus' }, { status: 403 });
    }

    // 3. Build bus snapshot
    const busSnapshot: BusSnapshot = {
      name: busData.name,
      regNumber: busData.regNumber,
      type: busData.type,
      totalSeats: busData.totalSeats,
      seatLayout: busData.seatLayout,
      amenities: busData.amenities || [],
      operatorName: busData.operatorName || busData.name,
      ...(busData.imageUrl ? { imageUrl: busData.imageUrl } : {})
    };

    // 4. Create or resolve Route
    const cleanStart = startCity.trim();
    const cleanEnd = endCity.trim();
    const routeSlug = `${cleanStart.toLowerCase()}-${cleanEnd.toLowerCase()}`.replace(/[^a-z0-9]/g, '-');
    const routeId = `ROUTE-${routeSlug}`;

    const routeSnapshot: RouteSnapshot = {
      id: routeId,
      startCity: cleanStart,
      endCity: cleanEnd,
      stops: Array.isArray(stops) ? stops : [],
      estDuration: duration || ''
    };

    // 5. Generate Trip ID and payload
    const tripId = `TRIP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const now = Date.now();

    const tripPayload: Trip = {
      id: tripId,
      busId,
      busSnapshot,
      routeId,
      routeSnapshot,
      departureDate,
      departureTime,
      arrivalTime: arrivalTime || '',
      duration: duration || '',
      baseFare: fare,
      farePerSeat: fare,
      ownerId: busData.ownerId || userId,
      operatorName: busData.operatorName || busData.name,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now
    };

    // 6. Write atomically to RTDB
    const updates: Record<string, unknown> = {};
    updates[`trips/${tripId}`] = tripPayload;
    updates[`ownerTrips/${busData.ownerId || userId}/${tripId}`] = true;
    updates[`busTrips/${busId}/${tripId}`] = true;
    updates[`routes/${routeId}`] = {
      id: routeId,
      startCity: cleanStart,
      endCity: cleanEnd,
      stops: stops || [],
      status: 'active',
      updatedAt: now
    };

    // Strip any accidental undefined values before writing to RTDB
    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    await update(ref(db), sanitizedUpdates);

    return NextResponse.json({
      success: true,
      tripId,
      trip: tripPayload
    });

  } catch (err: unknown) {
    console.error("POST /api/trips error:", err);
    const message = err instanceof Error ? err.message : 'Failed to schedule trip';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
