import { NextResponse } from 'next/server';
import { requireOwner, HttpError } from '@/lib/auth-server';
import { getAuthenticatedRequestClient } from '@/lib/supabase/authenticated-client';
import { normalizePhone } from '@/lib/tracking-access';
import { enforceSharedRateLimit } from '@/lib/rate-limiter';
export async function GET(req: Request) {
  try {
    const owner = await requireOwner(req);
    const db = getAuthenticatedRequestClient(req);
    const { data, error } = await db.from('owner_contacts').select('*').eq('owner_id', owner.uid)
      .order('created_at', { ascending: false });
    if (error) throw new HttpError(500, 'Unable to load contact numbers.');
    return NextResponse.json({ contacts: data || [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    return NextResponse.json({ error: err.message || 'Unable to load contacts.' }, { status: err.statusCode || 500 });
  }
}
export async function POST(req: Request) {
  try {
    await enforceSharedRateLimit(req, 'owner_contact_write', 20, 60);
    const owner = await requireOwner(req);
    const db = getAuthenticatedRequestClient(req);
    const body = await req.json();
    const name = String(body.name || '').trim(), phone = String(body.phone || '').trim();
    const normalizedPhone = normalizePhone(phone), contactType = String(body.contactType || '');
    const allowed = ['supervisor', 'driver', 'conductor', 'office', 'emergency'];
    if (name.length < 2 || name.length > 100 || !/^94[0-9]{9}$/.test(normalizedPhone) || !allowed.includes(contactType)) {
      return NextResponse.json({ error: 'Enter a valid name, Sri Lankan mobile number and contact type.' }, { status: 400 });
    }
    const busId = body.busId ? String(body.busId) : null, tripId = body.tripId ? String(body.tripId) : null;
    if (busId) {
      const { data: bus } = await db.from('buses').select('id').eq('id', busId).eq('owner_id', owner.uid).maybeSingle();
      if (!bus) return NextResponse.json({ error: 'Selected bus does not belong to this owner.' }, { status: 403 });
    }
    if (tripId) {
      const { data: trip } = await db.from('trips').select('id').eq('id', tripId).eq('owner_id', owner.uid).maybeSingle();
      if (!trip) return NextResponse.json({ error: 'Selected trip does not belong to this owner.' }, { status: 403 });
    }
    const { data: profile } = await db.from('profiles').select('id').eq('phone', phone).maybeSingle();
    const { data, error } = await db.from('owner_contacts').insert({
      owner_id: owner.uid, name, phone, normalized_phone: normalizedPhone, contact_type: contactType,
      bus_id: busId, trip_id: tripId, linked_user_id: profile?.id || null,
      can_control_tracking: contactType === 'supervisor' && body.canControlTracking !== false,
      can_view_all_trips: contactType === 'supervisor' && !busId && !tripId, active: true
    }).select('*').single();
    if (error) throw new HttpError(500, 'Unable to save this contact. Check whether the number is already registered.');
    return NextResponse.json({ success: true, contact: data }, { status: 201 });
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    return NextResponse.json({ error: err.message || 'Unable to save contact.' }, { status: err.statusCode || 500 });
  }
}
export async function DELETE(req: Request) {
  try {
    const owner = await requireOwner(req);
    const { searchParams } = new URL(req.url), contactId = searchParams.get('id');
    if (!contactId) return NextResponse.json({ error: 'Contact id is required.' }, { status: 400 });
    const db = getAuthenticatedRequestClient(req);
    const { error } = await db.from('owner_contacts').delete().eq('id', contactId).eq('owner_id', owner.uid);
    if (error) throw new HttpError(500, 'Unable to remove contact.');
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    return NextResponse.json({ error: err.message || 'Unable to remove contact.' }, { status: err.statusCode || 500 });
  }
}
