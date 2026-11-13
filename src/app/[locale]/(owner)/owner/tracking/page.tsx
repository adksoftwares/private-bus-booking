"use client";
import { useCallback, useEffect, useState } from 'react';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/hooks/useAuth';

type Trip = { id: string; departureDate: string; departureTime: string; routeSnapshot?: { startCity?: string; endCity?: string }; busSnapshot?: { name?: string; regNumber?: string } };
type Tracking = { session: { status: string; last_latitude?: number; last_longitude?: number; last_seen_at?: string; last_speed_kmh?: number }; };
export default function OwnerTrackingPage() {
  const { user, isOwner, isAdmin, authFetch, loading } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tracking, setTracking] = useState<Record<string, Tracking>>({});
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    const res = await authFetch('/api/trips?ownerId=' + encodeURIComponent(user.uid));
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load trips.');
    setTrips(json.trips || []);
    const entries = await Promise.all((json.trips || []).map(async (trip: Trip) => {
      const r = await authFetch('/api/tracking/' + encodeURIComponent(trip.id));
      const d = await r.json();
      return [trip.id, r.ok ? d : { session: { status: 'scheduled' } }] as const;
    }));
    setTracking(Object.fromEntries(entries));
  }, [user, authFetch]);
  useEffect(() => { if (user && (isOwner || isAdmin)) load().catch(e=>setError(e.message)); }, [user, isOwner, isAdmin, load]);
  useEffect(() => {
    if (!user || (!isOwner && !isAdmin)) return;
    const timer = window.setInterval(() => load().catch(e=>setError(e.message)), 12000);
    return () => window.clearInterval(timer);
  }, [user, isOwner, isAdmin, load]);
  const control = async (tripId: string, action: string) => {
    setBusyId(tripId); setError('');
    try {
      const res = await authFetch('/api/tracking/' + encodeURIComponent(tripId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to control tracking.');
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusyId(''); }
  };
  if (loading) return <main className="p-8">Loading…</main>;
  if (!user || (!isOwner && !isAdmin)) return <main className="p-8">Bus owner access is required.</main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Fleet control centre</p><h1 className="mt-2 text-3xl font-black text-slate-900">Live Bus Tracking</h1><p className="mt-2 text-sm text-slate-500">Monitor trips, control GPS sessions and review the latest driver location.</p></div><Link href="/owner/contacts" className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white">Manage contacts & supervisors</Link></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      {trips.map(trip => {
        const session = tracking[trip.id]?.session || { status: 'scheduled' };
        const live = session.status === 'live';
        return <article key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{trip.busSnapshot?.name || 'Bus'} · {trip.busSnapshot?.regNumber || ''}</h2><p className="mt-1 text-sm text-slate-500">{trip.routeSnapshot?.startCity || 'Route'} → {trip.routeSnapshot?.endCity || ''}</p><p className="mt-1 text-xs text-slate-400">{trip.departureDate} · {trip.departureTime}</p></div><span className={'rounded-full px-3 py-1 text-xs font-bold capitalize ' + (live ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>{session.status}</span></div>
          {session.last_latitude != null && session.last_longitude != null && <p className="mt-4 text-xs text-slate-600">GPS: {session.last_latitude.toFixed(5)}, {session.last_longitude.toFixed(5)} · {session.last_speed_kmh == null ? 'Speed unavailable' : Math.round(session.last_speed_kmh) + ' km/h'}</p>}
          <p className="mt-1 text-xs text-slate-400">{session.last_seen_at ? 'Last update ' + new Date(session.last_seen_at).toLocaleString() : 'No GPS location received yet'}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {session.status === 'scheduled' && <button disabled={busyId===trip.id} onClick={()=>control(trip.id,'start')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Start GPS</button>}
            {live && <><button disabled={busyId===trip.id} onClick={()=>control(trip.id,'pause')} className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white">Pause</button><button disabled={busyId===trip.id} onClick={()=>control(trip.id,'stop')} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">Finish trip</button></>}
            {session.status === 'paused' && <button disabled={busyId===trip.id} onClick={()=>control(trip.id,'resume')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Resume</button>}
            <Link href={'/driver/tracking/' + trip.id} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Open driver GPS screen</Link>
          </div>
        </article>;
      })}
    </div>
    {trips.length===0 && <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No scheduled trips found in your fleet.</p>}
  </main>;
}
