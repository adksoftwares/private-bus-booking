import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth-server';

export async function GET(req: Request) {
  try {
    const user = await requireAuth(req);
    const supabase = getSupabaseAdminClient();

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
    const user = await requireAuth(req);
    const body = await req.json();
    const { name, phone } = body;

    const supabase = getSupabaseAdminClient();

    const { error: updateError } = await supabase
      .from('profiles')
      .upsert({
        id: user.uid,
        name: name?.trim() || user.name || 'Passenger',
        phone: phone?.trim() || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (updateError) {
      console.error("Profile update error:", updateError);
      return NextResponse.json({ error: 'Failed to update profile.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Profile updated successfully' });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode || 500;
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status });
  }
}
