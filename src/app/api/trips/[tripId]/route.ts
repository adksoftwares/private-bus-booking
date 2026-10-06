import { NextResponse } from 'next/server';
import { getAdminDatabase } from '@/lib/serverFirebase';
import { requireTripOwnership } from '@/lib/auth-server';
import { updateTripSchema, formatZodError } from '@/lib/validation/schemas';

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  try {
    const { tripId } = await params;
    const db = getAdminDatabase();
    const tripSnap = await db.ref(`trips/${tripId}`).once('value');

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
    const db = getAdminDatabase();
    const now = Date.now();
    const updates: Record<string, unknown> = {};

    if (status) {
      updates[`trips/${tripId}/status`] = status;
    }

    if (farePerSeat !== undefined && farePerSeat !== null) {
      const newFare = Number(farePerSeat);
      updates[`trips/${tripId}/baseFare`] = newFare;
      updates[`trips/${tripId}/farePerSeat`] = newFare;
    }

    if (departureTime) {
      updates[`trips/${tripId}/departureTime`] = departureTime;
    }

    if (arrivalTime) {
      updates[`trips/${tripId}/arrivalTime`] = arrivalTime;
    }

    updates[`trips/${tripId}/updatedAt`] = now;

    const sanitizedUpdates = JSON.parse(JSON.stringify(updates));
    await db.ref().update(sanitizedUpdates);

    return NextResponse.json({ success: true, tripId });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const statusCode = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to update trip' }, { status: statusCode });
  }
}
