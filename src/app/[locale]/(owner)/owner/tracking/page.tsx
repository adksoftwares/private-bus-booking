"use client";

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/routing';
import AuthGuardCard from '@/components/shared/AuthGuardCard';
import { RefreshCw, BusFront, MapPin, Clock, Navigation, Radio, Activity, ShieldCheck } from 'lucide-react';

type T = {
  id: string;
  bus_id: string;
  route_snapshot: { startCity?: string; endCity?: string } | null;
  bus_snapshot: { name?: string; regNumber?: string } | null;
  departure_date: string;
  departure_time: string;
  tracking: {
    status: string;
    last_latitude?: number | null;
    last_longitude?: number | null;
    last_speed_kmh?: number | null;
    last_seen_at?: string | null;
  };
};

export default function OwnerTrackingPage() {
  const { user, isOwner, isAdmin, authFetch, loading } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<T[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await authFetch('/api/tracking/fleet');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Unable to load fleet tracking.');
    setTrips(j.trips || []);
    setError('');
  }, [authFetch]);

  useEffect(() => {
    if (user && (isOwner || isAdmin)) {
      load().catch((e: Error) => setError(e.message));
    }
  }, [user, isOwner, isAdmin, load]);

  useEffect(() => {
    if (!user || (!isOwner && !isAdmin)) return;
    const timer = window.setInterval(() => load().catch((e: Error) => setError(e.message)), 10000);
    return () => window.clearInterval(timer);
  }, [user, isOwner, isAdmin, load]);

  if (loading && !user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Connecting to fleet tracking telemetry...</p>
      </div>
    );
  }

  if (!user || (!isOwner && !isAdmin)) {
    return (
      <AuthGuardCard
        icon={Radio}
        badgeText="Fleet Tracking Center"
        title="Live Fleet GPS Tracking"
        description="Please sign in to your verified Bus Operator account to monitor live vehicle positions, route progress, and speed metrics for your scheduled journeys."
        loginRedirect="/owner/tracking"
        loginButtonText="Sign In as Operator"
      />
    );
  }

  const live = trips.filter(t => t.tracking.status === 'live');

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black uppercase tracking-wider mb-2">
            <Radio className="w-3.5 h-3.5 animate-pulse text-orange-600" />
            <span>Fleet Telemetry</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Live Bus GPS Tracking</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 font-medium">
            {isAdmin ? 'Platform-wide fleet monitoring across all registered operators.' : 'Real-time telemetry and GPS position tracking for your private bus fleet.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setBusy(true);
              load().catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
            }}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 active:scale-[0.98] px-4 py-3 text-xs sm:text-sm font-bold text-slate-700 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 text-orange-600 ${busy ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => router.push('/owner/contacts')}
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] px-4 py-3 text-xs sm:text-sm font-black text-white shadow-md transition-all cursor-pointer"
          >
            Manage Contacts
          </button>
        </div>
      </header>

      {/* Stats Counter Bar */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Scheduled Trips</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{trips.length}</p>
        </div>
        <div className="rounded-3xl border border-emerald-200/80 bg-emerald-50/70 p-6 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Live GPS Signals</p>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
          <p className="mt-2 text-3xl font-black text-emerald-900">{live.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Waiting / Paused</p>
          <p className="mt-2 text-3xl font-black text-slate-900">{trips.length - live.length}</p>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-800">
          {error}
        </div>
      )}

      {trips.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-14 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
            <BusFront className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No Active Trips Scheduled</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Once you schedule trips for your buses, they will appear here with live tracking telemetry.
          </p>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {trips.map(t => {
            const b = t.bus_snapshot || {};
            const route = t.route_snapshot || {};
            const g = t.tracking;
            const has = g.last_latitude != null && g.last_longitude != null;
            const isLive = g.status === 'live';

            return (
              <article key={t.id} className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200/60 text-orange-600 flex items-center justify-center shrink-0">
                      <BusFront className="w-6 h-6 stroke-[2.2]" />
                    </div>
                    <div>
                      <h2 className="font-black text-base text-slate-900">{b.name || 'Private Bus'}</h2>
                      <p className="text-xs text-slate-500 font-semibold">{b.regNumber || t.bus_id}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-wider ${
                    isLive ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {g.status || 'scheduled'}
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <Navigation className="h-4 w-4 text-orange-600 shrink-0" />
                    <span>{route.startCity || 'Start'} &rarr; {route.endCity || 'Destination'}</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{t.departure_date} &bull; {t.departure_time}</span>
                  </p>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50/80 border border-slate-200/60 p-3.5 text-xs text-slate-700">
                  {has ? (
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-slate-800 font-bold">
                        <MapPin className="mr-1 inline h-3.5 w-3.5 text-orange-600" />
                        {g.last_latitude!.toFixed(5)}, {g.last_longitude!.toFixed(5)}
                      </span>
                      <span className="font-black text-slate-900">
                        {g.last_speed_kmh == null ? 'Speed unavailable' : `${Math.round(g.last_speed_kmh)} km/h`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400 font-medium">Waiting for first GPS transmission from driver app.</span>
                  )}
                </div>

                <p className="mt-2 text-[11px] text-slate-400 font-medium">
                  {g.last_seen_at ? `Last update: ${new Date(g.last_seen_at).toLocaleTimeString()}` : 'No signal recorded yet'}
                </p>

                <button
                  onClick={() => router.push('/track/' + t.id)}
                  className="mt-4 w-full rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-[0.98] px-4 py-3 text-xs sm:text-sm font-black text-white shadow-sm transition-all cursor-pointer"
                >
                  View Live Map & Passenger Telemetry
                </button>
              </article>
            );
          })}
        </section>
      )}

      <footer className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-500">
        <ShieldCheck className="w-4 h-4 text-slate-400 inline mr-1.5" />
        Fleet status refreshes automatically every 10 seconds. Driver & conductor devices must initiate tracking from their mobile dashboard for their assigned trip.
      </footer>
    </main>
  );
}
