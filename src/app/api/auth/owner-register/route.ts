import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { ownerRegisterSchema, formatZodError } from '@/lib/validation/schemas';
import { Json } from '@/types/database';

export async function POST(req: Request) {
  try {
    // 1. Rate limiting & Server authentication
    enforceRateLimit(req, 'owner_register', 5, 60);
    const user = await requireAuth(req);

    // 2. Strict Zod validation
    const body = await req.json();
    const parseResult = ownerRegisterSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { name, phone, nic, address } = parseResult.data;
    const supabase = getSupabaseAdminClient();

    // 3. Register or update record in owners table
    const { error: ownerError } = await supabase
      .from('owners')
      .upsert({
        id: user.uid,
        name: name.trim(),
        email: user.email || null,
        phone: phone.trim(),
        nic: nic.trim().toUpperCase(),
        address: address.trim(),
        status: 'active',
        registered_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (ownerError) {
      console.error("Owner register error:", ownerError);
      return NextResponse.json({ error: 'Failed to register operator account.' }, { status: 500 });
    }

    // 4. Update profiles role to Owner (unless user is already an Admin, preventing accidental role demotion)
    const newRole = user.role === 'Admin' ? 'Admin' : 'Owner';

    await supabase
      .from('profiles')
      .upsert({
        id: user.uid,
        name: name.trim(),
        email: user.email || null,
        phone: phone.trim(),
        role: newRole,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    // 5. Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'owner_registered',
        resource_type: 'owner',
        resource_id: user.uid,
        actor_id: user.uid,
        metadata: { name: name.trim(), nic: nic.trim().toUpperCase() } as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

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
