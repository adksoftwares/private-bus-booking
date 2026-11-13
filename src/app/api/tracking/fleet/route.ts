import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
export async function GET(req: Request) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({error:'Sign in required.'},{status:401});
    if (!['Admin','Owner'].includes(user.role)) return NextResponse.json({error:'Owner or Admin access required.'},{status:403});
    const db=getSupabaseAdminClient();
    let q=db.from('trips').select('id,owner_id,bus_id,route_snapshot,bus_snapshot,departure_date,departure_time,arrival_time,status').in('status',['scheduled','departed']).order('departure_date').order('departure_time');
    if(user.role==='Owner') q=q.eq('owner_id',user.uid);
    const {data:trips,error}=await q; if(error) throw error;
    const ids=(trips||[]).map(t=>t.id);
    const {data:sessions,error:se}=ids.length?await db.from('trip_tracking_sessions').select('trip_id,status,started_at,ended_at,last_latitude,last_longitude,last_speed_kmh,last_seen_at').in('trip_id',ids):{data:[],error:null};
    if(se) throw se;
    const map=new Map((sessions||[]).map(s=>[s.trip_id,s]));
    return NextResponse.json({trips:(trips||[]).map(t=>({...t,tracking:map.get(t.id)||{status:'scheduled'}})),scope:user.role==='Admin'?'all':'owner'},{headers:{'Cache-Control':'private,no-store'}});
  } catch(e) { console.error(e); return NextResponse.json({error:'Unable to load fleet tracking.'},{status:500}); }
}