import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { requireOwner } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { createBusSchema, formatZodError } from '@/lib/validation/schemas';
import { Bus } from '@/types/bus';
import { Json } from '@/types/database';

export async function GET(req: Request) {
  try {
    // 1. Authoritative Fleet Authorization: Only verified Owners or Admins can list buses
    const authenticatedUser = await requireOwner(req);
    const { searchParams } = new URL(req.url);
    const requestedOwnerId = searchParams.get('ownerId');

    const supabase = getAuthenticatedRequestClient(req);
    let query = supabase
      .from('buses')
      .select('*')
      .order('created_at', { ascending: false });

    // Multi-tenant Fleet Isolation: Non-admins can strictly ONLY view their own fleet
    if (authenticatedUser.role === 'Admin') {
      if (requestedOwnerId) {
        query = query.eq('owner_id', requestedOwnerId);
      }
    } else {
      query = query.eq('owner_id', authenticatedUser.uid);
    }

    const { data: busesData, error } = await query;

    if (error) {
      console.error("GET /api/buses error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const buses: Bus[] = (busesData || []).map(b => ({
      id: b.id,
      ownerId: b.owner_id,
      name: b.name,
      regNumber: b.reg_number,
      type: b.type,
      totalSeats: b.total_seats,
      seatLayout: b.seat_layout as unknown as Bus['seatLayout'],
      amenities: b.amenities || [],
      imageUrl: b.image_url || undefined,
      status: b.status as Bus['status'],
      createdAt: new Date(b.created_at).getTime(),
      updatedAt: b.updated_at ? new Date(b.updated_at).getTime() : undefined
    }));

    return NextResponse.json({ buses });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Failed to fetch buses' }, { status });
  }
}

export async function POST(req: Request) {
  try {
    // 1. Rate limiting & Server authentication
    enforceRateLimit(req, 'create_bus', 15, 60);
    const authenticatedUser = await requireOwner(req);

    // 2. Strict Zod payload validation
    const rawBody = await req.json();
    const parseResult = createBusSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const {
      name,
      regNumber,
      type,
      totalSeats,
      seatLayout,
      amenities,
      imageUrl
    } = parseResult.data;

    const supabase = getAuthenticatedRequestClient(req);
    const busId = `BUS-${crypto.randomUUID()}`;

    // 3. Database insertion with server-bound owner ID
    const { error: insertError } = await supabase
      .from('buses')
      .insert([{
        id: busId,
        owner_id: authenticatedUser.uid,
        name: name.trim(),
        reg_number: regNumber.trim().toUpperCase(),
        type: type.trim(),
        total_seats: totalSeats,
        seat_layout: seatLayout as unknown as Json,
        amenities: amenities || [],
        image_url: imageUrl || null,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (insertError) {
      console.error("Failed to insert bus:", insertError);
      if (insertError.code === '23505') {
        return NextResponse.json({ error: 'A bus with this registration number is already registered.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to register bus in database.' }, { status: 500 });
    }

    // 4. Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'bus_created',
        resource_type: 'bus',
        resource_id: busId,
        actor_id: authenticatedUser.uid,
        metadata: {
          name: name.trim(),
          regNumber: regNumber.trim().toUpperCase(),
          totalSeats
        } as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

    return NextResponse.json({
      success: true,
      busId,
      message: 'Bus successfully added to your fleet!'
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
