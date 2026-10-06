import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/auth-server';
import { Bus } from '@/types/bus';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get('ownerId');

    // Public bus discovery remains available. Owner-scoped fleet queries are privileged.
    let effectiveOwnerId: string | null = null;
    if (ownerId) {
      const user = await requireOwner(req);
      if (!user.isAdmin && ownerId !== user.uid) {
        return NextResponse.json({ error: 'Access denied. You can only view your own fleet.' }, { status: 403 });
      }
      effectiveOwnerId = user.isAdmin ? ownerId : user.uid;
    }

    const supabase = getSupabaseAdminClient();
    let query = supabase
      .from('buses')
      .select('*')
      .order('created_at', { ascending: false });

    if (effectiveOwnerId) {
      query = query.eq('owner_id', effectiveOwnerId);
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
    const err = error as Error;
    return NextResponse.json({ error: err.message || 'Failed to fetch buses' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const authenticatedUser = await requireOwner(req);
    const body = await req.json();

    const {
      name,
      regNumber,
      type,
      totalSeats,
      seatLayout,
      amenities = [],
      imageUrl = ''
    } = body;

    if (!name || !regNumber || !type || !totalSeats) {
      return NextResponse.json({ error: 'Missing required bus specifications' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const busId = `BUS-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

    const { error: insertError } = await supabase
      .from('buses')
      .insert([{
        id: busId,
        owner_id: authenticatedUser.uid,
        name: name.trim(),
        reg_number: regNumber.trim().toUpperCase(),
        type: type.trim(),
        total_seats: Number(totalSeats),
        seat_layout: seatLayout || {},
        amenities: amenities,
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
