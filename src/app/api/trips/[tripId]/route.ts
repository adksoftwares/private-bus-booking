import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireTripOwnership } from '@/lib/auth-server';
import { updateTripSchema, formatZodError } from '@/lib/validation/schemas';
import { Database } from '@/types/database';

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: trip, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (error || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    return NextResponse.json({
      trip: {
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
      }
    });
  } catch (err: unknown) {
    console.error("GET /api/trips/[tripId] error:", err);
    return NextResponse.json({ error: 'Failed to fetch trip' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;

    // 1. Authoritative Server Ownership Check (Caller must be Admin or the Trip's verified Owner)
    await requireTripOwnership(req, tripId);

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
    const supabase = getSupabaseAdminClient();

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

    return NextResponse.json({ success: true, tripId });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to update trip' }, { status: statusCode });
  }
}
