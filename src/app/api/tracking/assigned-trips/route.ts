import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
export async function GET(req: Request) {
  try {
    const user=await getAuthenticatedUser(req);
    if(!user) return NextResponse.json({error:'Sign in required.'},{status:401});
    if(user.role!=='Conductor') return NextResponse.json({error:'Driver / Conductor account required.'},{status:403});
    const db=getSupabaseAdminClient();
    const {data:assignments,error}=await db.from('staff_trip_assignments').select('trip_id,assigned_role').eq('staff_id',user.uid);
    if(error) throw error;
    const ids=(assignments||[]).map(a=>a.trip_id);
    if(!ids.length) return NextResponse.json({trips:[]});
    const {data:trips,error:te}=await db.from('trips').select('id,bus_id,owner_id,route_snapshot,bus_snapshot,departure_date,departure_time,arrival_time,status').in('id',ids).in('status',['scheduled','departed']).order('departure_date').order('departure_time');
    if(te) throw te;
    const {data:sessions,error:se}=await db.from('trip_tracking_sessions').select('trip_id,status,started_at,last_seen_at').in('trip_id',ids);
    if(se) throw se;
    const sm=new Map((sessions||[]).map(s=>[s.trip_id,s]));
    const rm=new Map((assignments||[]).map(a=>[a.trip_id,a.assigned_role]));
    return NextResponse.json({trips:(trips||[]).map(t=>({...t,assignedRole:rm.get(t.id),tracking:sm.get(t.id)||{status:'scheduled'}}))},{headers:{'Cache-Control':'private,no-store'}});
  } catch(e) { console.error(e); return NextResponse.json({error:'Unable to load assigned trips.'},{status:500}); }
}