import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { requireOwner } from '@/lib/auth-server';
import { createTripSchema, formatZodError } from '@/lib/validation/schemas';
import { Trip, BusSnapshot, RouteSnapshot } from '@/types/trip';
import { Bus } from '@/types/bus';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');
    const date = searchParams.get('date');

    const db = getAdminDatabase();
    const tripsSnap = await db.ref('trips').once('value');

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
    // 1. Authoritative Server Authentication (Only verified Owners or Admins)
    const authenticatedUser = await requireOwner(req);
    const db = getAdminDatabase();

    // 2. Validate request payload with Zod
    const body = await req.json();
    const parseResult = createTripSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const {
      busId,
      startCity,
      endCity,
      stops = [],
      departureDate,
      departureTime,
      arrivalTime = '',
      duration = '',
      farePerSeat
    } = parseResult.data;

    // 3. Verify Bus exists and strictly enforce Owner Fleet Isolation
    const busSnap = await db.ref(`buses/${busId}`).once('value');
    if (!busSnap.exists()) {
      return NextResponse.json({ error: 'Selected bus record not found' }, { status: 404 });
    }

    const busData: Bus = busSnap.val();
    if (authenticatedUser.role !== 'Admin' && busData.ownerId !== authenticatedUser.uid) {
      return NextResponse.json({ error: 'Access denied. You do not own this bus.' }, { status: 403 });
    }

    // 4. Build bus snapshot
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

    // 5. Create or resolve Route
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

    // 6. Generate Trip ID and authoritative payload
    const tripId = `TRIP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const now = Date.now();
    const effectiveOwnerId = busData.ownerId || authenticatedUser.uid;

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
      baseFare: farePerSeat,
      farePerSeat: farePerSeat,
      ownerId: effectiveOwnerId,
      operatorName: busData.operatorName || busData.name,
      status: 'scheduled',
      createdAt: now,
      updatedAt: now
    };

    // 7. Write atomically to RTDB
    const updates: Record<string, unknown> = {};
    updates[`trips/${tripId}`] = tripPayload;
    updates[`ownerTrips/${effectiveOwnerId}/${tripId}`] = true;
    updates[`busTrips/${busId}/${tripId}`] = true;
    updates[`routes/${routeId}`] = {
      id: routeId,
      startCity: cleanStart,
      endCity: cleanEnd,
      stops: stops || [],
      status: 'active',
      updatedAt: now
    };

    // Strip any accidental undefined values
    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    await db.ref().update(sanitizedUpdates);

    return NextResponse.json({
      success: true,
      tripId,
      trip: tripPayload
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to schedule trip' }, { status });
  }
}
