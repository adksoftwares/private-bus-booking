import { NextResponse } from 'next/server';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { requireAuth } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limiter';
import { updateProfileSchema, formatZodError } from '@/lib/validation/schemas';
import { Json } from '@/types/database';

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req);
    const supabase = getAuthenticatedRequestClient(req);

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.uid)
      .maybeSingle();

    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    enforceRateLimit(req, 'update_profile', 20, 60);
    const user = await requireAuth(req);
    const body = await req.json();

    // 1. Validate payload with Zod
    const parseResult = updateProfileSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: formatZodError(parseResult.error) },
        { status: 400 }
      );
    }

    const { name, phone } = parseResult.data;
    const supabase = getAuthenticatedRequestClient(req);

    // 2. Fetch existing profile to retain values while preventing role escalation
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('name, phone')
      .eq('id', user.uid)
      .maybeSingle();

    const finalName = name !== undefined ? name.trim() : (existingProfile?.name || user.name || 'Passenger');
    const finalPhone = phone !== undefined ? (phone ? phone.trim() : null) : (existingProfile?.phone || null);

    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({
        id: user.uid,
        name: finalName,
        phone: finalPhone,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
    }

    // 3. Audit Log
    try {
      await supabase.from('audit_logs').insert([{
        action: 'profile_updated',
        resource_type: 'profile',
        resource_id: user.uid,
        actor_id: user.uid,
        metadata: { name: finalName, phone: finalPhone } as unknown as Json,
        created_at: new Date().toISOString()
      }]);
    } catch (auditErr) {
      console.warn("Non-critical: Audit log insert error:", auditErr);
    }

    return NextResponse.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status });
  }
}
