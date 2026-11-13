"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

type TrackData = {
  trip?: { departureDate: string; departureTime: string };
  session?: { status: string; last_latitude?: number; last_longitude?: number; last_seen_at?: string };
};

export default function DriverTrackingPage() {
  const params = useParams<{ tripId: string }>();
  const tripId = params.tripId;
  const { user, authFetch, loading } = useAuth();
  const [data, setData] = useState<TrackData | null>(null);
  const [message, setMessage] = useState('Loading trip tracking…');
  const [busy, setBusy] = useState(false);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);

  const refresh = useCallback(async () => {
    const res = await authFetch('/api/tracking/' + encodeURIComponent(tripId));
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load tracking.');
    setData(json);
    return json as TrackData;
  }, [authFetch, tripId]);

  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    const now = Date.now();
    if (now - lastSentAt.current < 8000) return;
    lastSentAt.current = now;
    const res = await authFetch('/api/tracking/' + encodeURIComponent(tripId) + '/location', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy, speed: position.coords.speed,
        heading: position.coords.heading
      })
    });
    if (!res.ok) {
      const json = await res.json();
      setMessage(json.error || 'GPS update failed.');
    } else setMessage('Live GPS sharing is active.');
  }, [authFetch, tripId]);

  const startWatch = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setMessage('This device does not support GPS location.');
      return;
    }
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = navigator.geolocation.watchPosition(sendLocation, error => {
      setMessage(error.message || 'Allow location access to share the bus GPS.');
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }, [sendLocation]);

  const control = useCallback(async (action: 'start' | 'pause' | 'resume' | 'stop') => {
    setBusy(true);
    try {
      const res = await authFetch('/api/tracking/' + encodeURIComponent(tripId), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to change tracking status.');
      await refresh();
      if (action === 'start' || action === 'resume') startWatch();
      if (action === 'pause' || action === 'stop') {
        if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setMessage(action === 'stop' ? 'Trip tracking completed.' : 'Tracking status: ' + json.status);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }, [authFetch, refresh, startWatch]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    refresh().then(initial => {
      if (!alive) return;
      if (initial.session?.status === 'live') startWatch();
    }).catch(error => setMessage((error as Error).message));
    return () => {
      alive = false;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [user, refresh, startWatch]);

  // Auto-start when the scheduled departure time is reached, provided this driver screen is open.
  useEffect(() => {
    if (!user || !data?.trip || data.session?.status !== 'scheduled') return;
    const departure = new Date(data.trip.departureDate + 'T' + data.trip.departureTime);
    const timer = window.setInterval(() => {
      if (Date.now() >= departure.getTime()) control('start');
    }, 15000);
    return () => window.clearInterval(timer);
  }, [user, data, control]);

  if (loading) return <main className="mx-auto max-w-xl p-6">Loading driver account…</main>;
  if (!user) return <main className="mx-auto max-w-xl p-6">Please sign in with your assigned driver account.</main>;
  const status = data?.session?.status || 'scheduled';
  return <main className="mx-auto max-w-xl p-5 sm:p-8">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Driver GPS Console</p>
      <h1 className="mt-2 text-2xl font-black text-slate-900">Bus live tracking</h1>
      <p className="mt-1 break-all text-sm text-slate-500">Trip {tripId}</p>
      <div className="my-6 flex items-center justify-between rounded-2xl bg-slate-50 p-4">
        <span className="font-semibold text-slate-600">Tracking status</span>
        <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold capitalize text-sky-800">{status}</span>
      </div>
      <p className="min-h-12 text-sm text-slate-600">{message}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {status === 'scheduled' && <button disabled={busy} onClick={() => control('start')} className="col-span-2 rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">Start trip & share GPS</button>}
        {status === 'live' && <>
          <button disabled={busy} onClick={() => control('pause')} className="rounded-xl bg-amber-500 p-3 font-bold text-white disabled:opacity-50">Pause GPS</button>
          <button disabled={busy} onClick={() => control('stop')} className="rounded-xl bg-rose-600 p-3 font-bold text-white disabled:opacity-50">Finish trip</button>
        </>}
        {status === 'paused' && <button disabled={busy} onClick={() => control('resume')} className="col-span-2 rounded-xl bg-emerald-600 p-3 font-bold text-white disabled:opacity-50">Resume GPS</button>}
        {status === 'completed' && <p className="col-span-2 text-sm font-semibold text-emerald-700">This trip has ended. GPS sharing is off.</p>}
      </div>
      <p className="mt-6 text-xs leading-5 text-slate-400">Keep this screen open during the trip and allow location access. For screen-off and 24-hour reliability, use a native driver app with an Android foreground location service.</p>
    </div>
  </main>;
}
