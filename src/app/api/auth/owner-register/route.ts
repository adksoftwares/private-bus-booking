import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth-server';

export async function POST(req: Request) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();
    const { name, phone, nic, address } = body;

    const supabase = getSupabaseAdminClient();

    // 1. Insert or update into owners table
    const { error: ownerError } = await supabase
      .from('owners')
      .upsert({
        id: user.uid,
        name: name?.trim() || user.name || 'Bus Operator',
        email: user.email || null,
        phone: phone?.trim() || user.phone || null,
        nic: nic?.trim() || null,
        address: address?.trim() || null,
        status: 'active',
        registered_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (ownerError) {
      console.error("Owner register error:", ownerError);
      return NextResponse.json({ error: 'Failed to register operator account.' }, { status: 500 });
    }

    // 2. Update profiles role to Owner
    await supabase
      .from('profiles')
      .upsert({
        id: user.uid,
        name: name?.trim() || user.name || 'Bus Operator',
        email: user.email || null,
        phone: phone?.trim() || user.phone || null,
        role: 'Owner',
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    return NextResponse.json({
      success: true,
      message: 'Congratulations! Your account is now registered as a Bus Operator.'
    });

  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status });
  }
}
