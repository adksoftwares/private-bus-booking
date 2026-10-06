import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/auth-server';

export async function PATCH(req: Request, { params }: { params: Promise<{ busId: string }> }) {
  try {
    const { busId } = await params;
    const authenticatedUser = await requireOwner(req);
    const body = await req.json();
    const { status } = body;

    const supabase = getSupabaseAdminClient();

    // Verify ownership
    const { data: bus, error: findError } = await supabase
      .from('buses')
      .select('owner_id')
      .eq('id', busId)
      .maybeSingle();

    if (findError || !bus) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 });
    }

    if (authenticatedUser.role !== 'Admin' && bus.owner_id !== authenticatedUser.uid) {
      return NextResponse.json({ error: 'Access denied: You do not own this bus.' }, { status: 403 });
    }

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

    return NextResponse.json({ success: true, busId, status });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status });
  }
}
