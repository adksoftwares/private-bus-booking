import { NextResponse } from 'next/server';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { requireOwner } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { updateBusSchema, formatZodError } from '@/lib/validation/schemas';
import { Json } from '@/types/database';

export async function PATCH(req: Request, { params }: { params: Promise<{ busId: string }> }) {
  try {
    enforceRateLimit(req, 'update_bus', 30, 60);
    const { busId } = await params;
    const authenticatedUser = await requireOwner(req);

    const body = await req.json();
    const parseResult = updateBusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { status } = parseResult.data;
    const supabase = getAuthenticatedRequestClient(req);

    // Verify ownership and fetch current status
    const { data: bus, error: findError } = await supabase
      .from('buses')
      .select('owner_id, status')
      .eq('id', busId)
      .maybeSingle();

    if (findError || !bus) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    if (authenticatedUser.role !== 'Admin' && bus.owner_id !== authenticatedUser.uid) {
      return NextResponse.json({ error: 'Access denied: You do not own this bus.' }, { status: 403 });
    }

    const oldStatus = bus.status;

    const { error: updateError } = await supabase
      .from('buses')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', busId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'bus_status_updated',
        resource_type: 'bus',
        resource_id: busId,
        actor_id: authenticatedUser.uid,
        metadata: { oldStatus, newStatus: status } as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

    return NextResponse.json({ success: true, busId, status });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
