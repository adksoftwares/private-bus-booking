import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { requireOwner } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { createTripSchema, formatZodError } from '@/lib/validation/schemas';
import { Trip, BusSnapshot, RouteSnapshot, BookedSeatInfo } from '@/types/trip';
import { Json } from '@/types/database';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedOwnerId = searchParams.get('ownerId');
    const date = searchParams.get('date');

    const supabase = getAuthenticatedRequestClient(req);
    let query = supabase
      .from('trips')
      .select('*')
      .order('departure_date', { ascending: false })
      .order('departure_time', { ascending: true });

    // Multi-tenant Trip Isolation:
    // If ownerId is specifically requested (e.g. Owner Dashboard), enforce authentication and ownership
    if (requestedOwnerId) {
      const authUser = await requireOwner(req);
      if (authUser.role !== 'Admin' && authUser.uid !== requestedOwnerId) {
        return NextResponse.json({ error: 'Access denied: You can only query your own trips.' }, { status: 403 });
      }
      query = query.eq('owner_id', requestedOwnerId);
    } else {
      // Public search: strictly return only active scheduled trips
      query = query.eq('status', 'scheduled');
    }

    if (date) {
      query = query.eq('departure_date', date);
    }

    const { data: tripsData, error } = await query;

    if (error) {
      console.error("GET /api/trips Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Load bookedSeats map for each trip from seat_locks with privacy masking
    const tripIds = (tripsData || []).map(t => t.id);
    const locksMap: Record<string, Record<string, BookedSeatInfo>> = {};

    if (tripIds.length > 0) {
      const { data: seatLocks } = await supabase
        .from('seat_locks')
        .select('trip_id, seat_id, status, expires_at')
        .in('trip_id', tripIds);

      const now = Date.now();
      for (const lock of seatLocks || []) {
        if (lock.status === 'booked' || (lock.status === 'locked' && lock.expires_at && new Date(lock.expires_at).getTime() > now)) {
          if (!locksMap[lock.trip_id]) locksMap[lock.trip_id] = {};
          locksMap[lock.trip_id][lock.seat_id] = {
            status: lock.status as BookedSeatInfo['status'],
            uid: 'masked'
          };
        }
      }
    }

    const trips: Trip[] = (tripsData || []).map((t) => ({
      id: t.id,
      busId: t.bus_id,
      ownerId: t.owner_id,
      routeId: t.route_id || '',
      routeSnapshot: t.route_snapshot as unknown as RouteSnapshot,
      busSnapshot: t.bus_snapshot as unknown as BusSnapshot,
      departureDate: t.departure_date,
      departureTime: t.departure_time,
      arrivalTime: t.arrival_time || undefined,
      duration: t.duration || undefined,
      baseFare: Number(t.base_fare),
      farePerSeat: Number(t.fare_per_seat),
      operatorName: t.operator_name || undefined,
      status: t.status as Trip['status'],
      bookedSeats: locksMap[t.id] || {},
      createdAt: new Date(t.created_at).getTime(),
      updatedAt: new Date(t.updated_at).getTime()
    }));

    return NextResponse.json({ trips });
  } catch (err: unknown) {
    const errorObj = err as { statusCode?: number; message?: string };
    const statusCode = errorObj.statusCode || 500;
    return NextResponse.json({ error: errorObj.message || 'Failed to fetch trips' }, { status: statusCode });
  }
}

export async function POST(req: Request) {
  try {
    // 1. Rate limiting & Authoritative Server Authentication
    enforceRateLimit(req, 'create_trip', 15, 60);
    const authenticatedUser = await requireOwner(req);
    const supabase = getAuthenticatedRequestClient(req);

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

    // 3. Verify Bus exists, is active, and enforce Owner Fleet Isolation
    const { data: busData, error: busError } = await supabase
      .from('buses')
      .select('*')
      .eq('id', busId)
      .maybeSingle();

    if (busError || !busData) {
      return NextResponse.json({ error: 'Selected bus record not found' }, { status: 404 });
    }

    if (authenticatedUser.role !== 'Admin' && busData.owner_id !== authenticatedUser.uid) {
      return NextResponse.json({ error: 'Access denied. You do not own this bus.' }, { status: 403 });
    }

    if (busData.status !== 'active') {
      return NextResponse.json({ error: `Cannot schedule trips for bus with '${busData.status}' status.` }, { status: 400 });
    }

    // 4. Build bus snapshot
    const busSnapshot: BusSnapshot = {
      name: busData.name,
      regNumber: busData.reg_number,
      type: busData.type,
      totalSeats: busData.total_seats,
      seatLayout: busData.seat_layout as unknown as BusSnapshot['seatLayout'],
      amenities: busData.amenities || [],
      operatorName: busData.name,
      ...(busData.image_url ? { imageUrl: busData.image_url } : {})
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
      stops: stops.map((s, idx) => ({
        city: s.city.trim(),
        stopName: s.stopName.trim(),
        stopOrder: idx + 1
      }))
    };

    // Save or update Route in Supabase
    await supabase
      .from('routes')
      .upsert([{
        id: routeId,
        start_city: cleanStart,
        end_city: cleanEnd,
        stops: routeSnapshot.stops as unknown as Json,
        created_at: new Date().toISOString()
      }], { onConflict: 'id' });

    // 6. Generate Trip ID & Record
    const tripId = `TRIP-${crypto.randomUUID()}`;
    const finalFare = Number(farePerSeat);

    const tripRecord = {
      id: tripId,
      bus_id: busId,
      owner_id: busData.owner_id,
      route_id: routeId,
      route_snapshot: routeSnapshot as unknown as Json,
      bus_snapshot: busSnapshot as unknown as Json,
      departure_date: departureDate,
      departure_time: departureTime,
      arrival_time: arrivalTime || null,
      duration: duration || null,
      base_fare: finalFare,
      fare_per_seat: finalFare,
      operator_name: busData.name,
      status: 'scheduled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: insertTripError } = await supabase
      .from('trips')
      .insert([tripRecord]);

    if (insertTripError) {
      console.error("Failed to insert trip:", insertTripError);
      return NextResponse.json({ error: 'Failed to create trip schedule in database.' }, { status: 500 });
    }

    // 7. Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'trip_created',
        resource_type: 'trip',
        resource_id: tripId,
        actor_id: authenticatedUser.uid,
        metadata: {
          busId,
          startCity: cleanStart,
          endCity: cleanEnd,
          departureDate,
          departureTime,
          farePerSeat: finalFare
        } as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

    return NextResponse.json({
      success: true,
      tripId,
      trip: {
        id: tripId,
        busId,
        ownerId: busData.owner_id,
        routeId,
        routeSnapshot,
        busSnapshot,
        departureDate,
        departureTime,
        arrivalTime,
        duration,
        baseFare: finalFare,
        farePerSeat: finalFare,
        operatorName: busData.name,
        status: 'scheduled'
      }
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error scheduling trip' }, { status: statusCode });
  }
}
