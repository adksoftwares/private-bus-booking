"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AuthGuardCard from '@/components/shared/AuthGuardCard';
import { BusFront, MapPin, Play, Square, Pause, Radio, ShieldCheck, Compass, AlertTriangle } from 'lucide-react';

type T = {
  id: string;
  bus_id: string;
  route_snapshot: { startCity?: string; endCity?: string } | null;
  bus_snapshot: { name?: string; regNumber?: string } | null;
  departure_date: string;
  departure_time: string;
  assignedRole: string;
  tracking: { status: string };
};

export default function DriverGpsPage() {
  const { user, role, authFetch, loading } = useAuth();
  const [trips, setTrips] = useState<T[]>([]);
  const [selected, setSelected] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracy: number } | null>(null);
  const watch = useRef<number | null>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const load = useCallback(async () => {
    const r = await authFetch('/api/tracking/assigned-trips');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Unable to load assigned trips');
    setTrips(j.trips || []);
    setSelected(v => v || j.trips?.[0]?.id || '');
  }, [authFetch]);

  useEffect(() => {
    if (user && role === 'Conductor') {
      load().catch((e: Error) => setMessage(e.message));
    }
  }, [user, role, load]);

  useEffect(() => {
    return () => {
      if (watch.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watch.current);
      }
      if (wake.current) {
        void wake.current.release();
      }
    };
  }, []);

  const send = useCallback(async (id: string, p: GeolocationPosition) => {
    const r = await authFetch('/api/tracking/' + encodeURIComponent(id) + '/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        accuracy: p.coords.accuracy,
        speed: p.coords.speed,
        heading: p.coords.heading
      })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'GPS upload failed');
    setGps({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
  }, [authFetch]);

  const act = async (a: 'start' | 'pause' | 'resume' | 'stop') => {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    try {
      if (a === 'start' || a === 'resume') {
        if (!navigator.geolocation) throw new Error('GPS is unavailable on this device');
        const p = await new Promise<GeolocationPosition>((ok, no) =>
          navigator.geolocation.getCurrentPosition(ok, no, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
        );
        const r = await authFetch('/api/tracking/' + encodeURIComponent(selected), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: a })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Unable to start GPS');
        await send(selected, p);
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = navigator.geolocation.watchPosition(
          pos => { void send(selected, pos).catch((e: Error) => setMessage(e.message)); },
          e => setMessage('GPS issue: ' + e.message),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        try {
          const n = navigator as Navigator & { wakeLock?: { request: (v: 'screen') => Promise<{ release: () => Promise<void> }> } };
          wake.current = (await n.wakeLock?.request('screen')) || null;
        } catch {}
        setMessage('GPS is live. Keep this page open for the journey.');
      } else {
        const r = await authFetch('/api/tracking/' + encodeURIComponent(selected), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: a })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Unable to update trip');
        if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
        watch.current = null;
        if (a === 'stop' && wake.current) {
          await wake.current.release();
          wake.current = null;
        }
        setMessage(a === 'stop' ? 'Trip completed.' : 'GPS paused.');
      }
      await load();
    } catch (e: unknown) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verifying driver credentials...</p>
      </div>
    );
  }

  if (!user || role !== 'Conductor') {
    return (
      <AuthGuardCard
        icon={Radio}
        badgeText="Driver & Staff Operations"
        title="Driver Live GPS Telemetry"
        description="Please sign in with your verified Driver or Conductor account to broadcast live vehicle GPS coordinates during scheduled passenger journeys."
        loginRedirect="/gps"
        loginButtonText="Sign In as Driver / Conductor"
      />
    );
  }

  const trip = trips.find(t => t.id === selected);
  const status = trip?.tracking?.status || 'scheduled';

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4 sm:p-8">
      <header>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black uppercase tracking-wider mb-2">
          <Radio className="w-3.5 h-3.5 text-orange-600 animate-pulse" />
          <span>Driver Dashboard</span>
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Trip GPS Control</h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
          Only intercity trips officially assigned to this signed-in Driver or Conductor account appear here.
        </p>
      </header>

      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
        <label className="block text-xs font-black text-slate-400 uppercase tracking-wider">
          Assigned Bus Journey
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-bold text-slate-900 outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer"
          >
            {trips.length === 0 ? (
              <option value="">No trips currently assigned</option>
            ) : (
              trips.map(t => (
                <option key={t.id} value={t.id}>
                  {t.bus_snapshot?.name || t.bus_id} &bull; {t.departure_date} at {t.departure_time}
                </option>
              ))
            )}
          </select>
        </label>

        {trip && (
          <>
            <div className="mt-4 flex items-center gap-3.5 rounded-2xl bg-slate-50/80 border border-slate-200/60 p-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                <BusFront className="h-6 w-6 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">
                  {trip.bus_snapshot?.name || 'Assigned bus'} &bull; {trip.bus_snapshot?.regNumber || trip.bus_id}
                </p>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {trip.route_snapshot?.startCity || 'Start'} &rarr; {trip.route_snapshot?.endCity || 'Destination'} &bull; <span className="text-orange-600 font-bold">{trip.assignedRole}</span>
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-600 font-semibold">
              Departure: <strong className="text-slate-900">{trip.departure_date} at {trip.departure_time}</strong>
            </p>
          </>
        )}

        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">GPS Broadcaster Status</span>
          <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
            status === 'live' ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700'
          }`}>
            {status}
          </span>
        </div>
      </section>

      {gps && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-bold text-emerald-900 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>GPS Fix Active: {gps.lat.toFixed(5)}, {gps.lon.toFixed(5)}</span>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-200/60 text-emerald-950">
            &plusmn;{Math.round(gps.accuracy)}m
          </span>
        </div>
      )}

      {message && (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-800 shadow-2xs">
          {message}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3">
        <button
          disabled={busy || !trip || status === 'live' || status === 'completed'}
          onClick={() => act('start')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] p-4 text-sm font-black text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-40"
        >
          <Play className="h-4 w-4" />
          <span>Start GPS</span>
        </button>
        <button
          disabled={busy || status !== 'live'}
          onClick={() => act('pause')}
          className="flex items-center justify-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] p-4 text-sm font-black text-amber-900 transition-all cursor-pointer disabled:opacity-40"
        >
          <Pause className="h-4 w-4" />
          <span>Pause</span>
        </button>
        <button
          disabled={busy || status !== 'paused'}
          onClick={() => act('resume')}
          className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] p-4 text-sm font-black text-slate-800 transition-all cursor-pointer disabled:opacity-40"
        >
          <Radio className="h-4 w-4" />
          <span>Resume</span>
        </button>
        <button
          disabled={busy || !['live', 'paused'].includes(status)}
          onClick={() => act('stop')}
          className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] p-4 text-sm font-black text-white shadow-md transition-all cursor-pointer disabled:opacity-40"
        >
          <Square className="h-4 w-4" />
          <span>Finish Trip</span>
        </button>
      </section>

      <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-900 font-medium">
        <ShieldCheck className="mr-1.5 inline h-4 w-4 text-amber-600" />
        Keep this browser tab open during the trip. Modern mobile operating systems may pause background location updates when the screen locks. For uninterrupted background telemetry, use the companion Android GPS tracker service.
      </div>
    </main>
  );
}
