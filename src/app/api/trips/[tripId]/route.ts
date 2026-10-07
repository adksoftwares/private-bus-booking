import { NextResponse } from 'next/server';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { requireTripOwnership } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { updateTripSchema, formatZodError } from '@/lib/validation/schemas';
import { Database, Json } from '@/types/database';

// High-performance server-side in-memory cache for trips
interface CachedTripEntry {
  trip: any;
  cachedAt: number;
}
const tripMemoryCache = new Map<string, CachedTripEntry>();
const TRIP_CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL

export function invalidateTripCache(tripId?: string) {
  if (tripId) {
    tripMemoryCache.delete(tripId);
  } else {
    tripMemoryCache.clear();
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    
    // Check in-memory cache first (sub-millisecond response)
    const cached = tripMemoryCache.get(tripId);
    const now = Date.now();
    if (cached && (now - cached.cachedAt) < TRIP_CACHE_TTL_MS) {
      return NextResponse.json({ trip: cached.trip }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          'X-Cache': 'HIT'
        }
      });
    }

    const supabase = getAuthenticatedRequestClient(req);

    const { data: trip, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (error || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    const formattedTrip = {
      id: trip.id,
      busId: trip.bus_id,
      ownerId: trip.owner_id,
      routeId: trip.route_id,
      routeSnapshot: trip.route_snapshot,
      busSnapshot: trip.bus_snapshot,
      departureDate: trip.departure_date,
      departureTime: trip.departure_time,
      arrivalTime: trip.arrival_time,
      duration: trip.duration,
      baseFare: trip.base_fare,
      farePerSeat: trip.fare_per_seat,
      operatorName: trip.operator_name,
      status: trip.status
    };

    // Store in memory cache
    tripMemoryCache.set(tripId, {
      trip: formattedTrip,
      cachedAt: now
    });

    return NextResponse.json({ trip: formattedTrip }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Cache': 'MISS'
      }
    });
  } catch (err: unknown) {
    console.error("GET /api/trips/[tripId] error:", err);
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    enforceRateLimit(req, 'update_trip', 30, 60);
    const { tripId } = await params;

    // 1. Authoritative Server Ownership Check (Caller must be Admin or the Trip's verified Owner)
    const user = await requireTripOwnership(req, tripId);

    // 2. Validate update payload with Zod
    const body = await req.json();
    const parseResult = updateTripSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { status, farePerSeat, departureTime, arrivalTime } = parseResult.data;
    const supabase = getAuthenticatedRequestClient(req);

    const updates: Database['public']['Tables']['trips']['Update'] = {
      updated_at: new Date().toISOString()
    };

    if (status) {
      updates.status = status;
    }

    if (farePerSeat !== undefined && farePerSeat !== null) {
      const newFare = Number(farePerSeat);
      updates.base_fare = newFare;
      updates.fare_per_seat = newFare;
    }

    if (departureTime) {
      updates.departure_time = departureTime;
    }

    if (arrivalTime) {
      updates.arrival_time = arrivalTime;
    }

    const { error: updateError } = await supabase
      .from('trips')
      .update(updates)
      .eq('id', tripId);

    if (updateError) {
      console.error("Failed to update trip:", updateError);
      return NextResponse.json({ error: 'Failed to update trip' }, { status: 500 });
    }

    // Invalidate server memory cache immediately
    invalidateTripCache(tripId);

    // 3. Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'trip_updated',
        resource_type: 'trip',
        resource_id: tripId,
        actor_id: user.uid,
        metadata: updates as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

    return NextResponse.json({ success: true, tripId });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to update trip' }, { status: statusCode });
  }
}
