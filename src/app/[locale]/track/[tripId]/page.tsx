"use client";
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Point = { latitude: number; longitude: number; recorded_at: string; speed_kmh: number | null };
type Result = { session: { status: string; last_latitude?: number; last_longitude?: number; last_seen_at?: string }; points: Point[] };
export default function CustomerTrackingPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [reference, setReference] = useState('');
  const [token, setToken] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(false);
  const load = async () => {
    const query = new URLSearchParams({ bookingReference: reference, accessToken: token });
    const res = await fetch('/api/tracking/' + encodeURIComponent(tripId) + '?' + query.toString(), { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to access this trip.');
    setResult(json); setError('');
    return json as Result;
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await load(); setActive(true); } catch (e) { setError((e as Error).message); }
  };
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { load().catch(e=>setError((e as Error).message)); }, 7000);
    return () => window.clearInterval(timer);
  }, [active, reference, token, tripId]);
  const last = result?.points?.[result.points.length - 1];
  const mapUrl = useMemo(() => {
    if (!last) return '';
    const lat = last.latitude, lon = last.longitude;
    return 'https://www.openstreetmap.org/export/embed.html?bbox=' +
      [lon - 0.035, lat - 0.025, lon + 0.035, lat + 0.025].join('%2C') +
      '&layer=mapnik&marker=' + lat + '%2C' + lon;
  }, [last]);
  return <main className="mx-auto max-w-5xl space-y-6 p-5 sm:p-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Passenger service</p><h1 className="mt-2 text-3xl font-black text-slate-900">Track your bus live</h1><p className="mt-2 text-sm text-slate-500">Enter the booking reference and private tracking access token shown with your ticket.</p></header>
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-3">
      <input required placeholder="Booking reference" value={reference} onChange={e=>setReference(e.target.value)} className="rounded-xl border border-slate-300 p-3" />
      <input required type="password" placeholder="Booking access token" value={token} onChange={e=>setToken(e.target.value)} className="rounded-xl border border-slate-300 p-3" />
      <button className="rounded-xl bg-slate-900 p-3 font-bold text-white">View live bus</button>
    </form>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {result && <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div><p className="text-sm text-slate-500">Trip status</p><p className="text-xl font-black capitalize text-slate-900">{result.session.status}</p></div>
        <p className="text-xs text-slate-500">{result.session.last_seen_at ? 'Last GPS update: ' + new Date(result.session.last_seen_at).toLocaleString() : 'Waiting for first GPS signal'}</p>
      </div>
      {mapUrl && <iframe title="Live bus location map" src={mapUrl} className="h-[420px] w-full rounded-2xl border border-slate-200" loading="lazy" />}
      {last && <p className="text-sm text-slate-600">Current location: {last.latitude.toFixed(5)}, {last.longitude.toFixed(5)} · {last.speed_kmh == null ? 'Speed unavailable' : Math.round(last.speed_kmh) + ' km/h'}</p>}
      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold text-slate-900">Journey GPS history</h2><p className="mt-1 text-xs text-slate-500">{result.points.length} location points recorded. This list updates every 7 seconds while the page is open.</p><ol className="mt-4 max-h-64 space-y-2 overflow-auto">{result.points.slice().reverse().map((point,index)=><li key={point.recorded_at + index} className="flex justify-between gap-4 border-b border-slate-100 pb-2 text-xs"><span>{new Date(point.recorded_at).toLocaleTimeString()}</span><span>{point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}</span></li>)}</ol></div>
    </section>}
  </main>;
}
