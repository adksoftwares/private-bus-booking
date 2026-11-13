"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type Point = { latitude: number; longitude: number; recorded_at: string; speed_kmh: number | null };
type Result = { session: { status: string; last_latitude?: number; last_longitude?: number; last_seen_at?: string }; points: Point[] };
export default function CustomerTrackingPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { user, authFetch, loading } = useAuth();
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await authFetch('/api/tracking/' + encodeURIComponent(tripId));
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'This trip is not linked to a booking in your signed-in account.');
    setResult(json); setError(''); return json as Result;
  }, [authFetch, tripId]);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    load().catch(e => { if (alive) setError((e as Error).message); });
    const timer = window.setInterval(() => { if (alive) load().catch(e => setError((e as Error).message)); }, 7000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [user, load]);
  const last = result?.points?.[result.points.length - 1];
  const mapUrl = useMemo(() => {
    if (!last) return '';
    const lat = last.latitude, lon = last.longitude;
    return 'https://www.openstreetmap.org/export/embed.html?bbox=' + [lon - 0.035, lat - 0.025, lon + 0.035, lat + 0.025].join('%2C') + '&layer=mapnik&marker=' + lat + '%2C' + lon;
  }, [last]);
  if (loading) return <main className="mx-auto max-w-xl p-6">Loading account…</main>;
  if (!user) return <main className="mx-auto max-w-xl space-y-3 p-6"><h1 className="text-2xl font-black">Sign in to track your bus</h1><p className="text-sm text-slate-600">Only bookings made while signed in to your customer account can be tracked. Guest bookings do not have account tracking access.</p></main>;
  return <main className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Customer account tracking</p><h1 className="mt-2 text-3xl font-black text-slate-900">Your booked bus location</h1><p className="mt-2 text-sm text-slate-500">You can view only trips booked from this signed-in account.</p></header>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {result && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div><p className="text-sm text-slate-500">Trip status</p><p className="text-xl font-black capitalize text-slate-900">{result.session.status}</p></div><p className="text-xs text-slate-500">{result.session.last_seen_at ? 'Last GPS update: ' + new Date(result.session.last_seen_at).toLocaleString() : 'Waiting for first GPS signal'}</p></div>
      {mapUrl && <iframe title="Live bus location map" src={mapUrl} className="h-[420px] w-full rounded-2xl border border-slate-200" loading="lazy" />}
      {last && <p className="text-sm text-slate-600">Current location: {last.latitude.toFixed(5)}, {last.longitude.toFixed(5)} · {last.speed_kmh == null ? 'Speed unavailable' : Math.round(last.speed_kmh) + ' km/h'}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Journey GPS history</h2><p className="mt-1 text-xs text-slate-500">{result.points.length} location points recorded. Updates every 7 seconds while this page is open.</p><ol className="mt-4 max-h-64 space-y-2 overflow-auto">{result.points.slice().reverse().map((point,index)=><li key={point.recorded_at + index} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-xs"><span>{new Date(point.recorded_at).toLocaleTimeString()}</span><span>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span></li>)}</ol></div>
    </section>}
  </main>;
}