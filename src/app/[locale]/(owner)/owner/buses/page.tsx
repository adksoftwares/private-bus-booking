"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ref, get, update, serverTimestamp } from 'firebase/database';
import { db } from '@/lib/firebase';
import { Bus } from '@/types/bus';
import { Bus as BusIcon, Plus, ShieldCheck, Wifi, Snowflake, Zap, Tv, Briefcase, CheckCircle2, AlertCircle, Calendar } from 'lucide-react';

export default function FleetPage() {
  const { user, isOwner, isAdmin, refreshRole } = useAuth();
  const router = useRouter();
  const t = useTranslations('fleet');

  const [buses, setBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [becomingOwner, setBecomingOwner] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const busesRef = ref(db, 'buses');
    get(busesRef).then((snap) => {
      if (!isMounted) return;

      if (snap.exists()) {
        const list: Bus[] = [];
        snap.forEach((childSnap) => {
          const data = childSnap.val() as Omit<Bus, 'id'>;
          // Admin sees all, Owner sees only their buses
          if (isAdmin || data.ownerId === user.uid) {
            list.push({ id: childSnap.key as string, ...data });
          }
        });
        setBuses(list);
      } else {
        setBuses([]);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Error loading bus fleet:", err);
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin]);

  const handleBecomeOwner = async () => {
    if (!user) return;
    setBecomingOwner(true);
    setNotice(null);

    try {
      const now = Date.now();
      const updates: Record<string, unknown> = {};
      updates[`users/${user.uid}/role`] = 'Owner';
      updates[`owners/${user.uid}`] = {
        uid: user.uid,
        name: user.displayName || 'Bus Operator',
        email: user.email || '',
        registeredAt: now,
        status: 'active'
      };

      await update(ref(db), updates);
      await refreshRole();
      setNotice({ type: 'success', message: 'Congratulations! Your account is now registered as a Bus Operator.' });
    } catch (err: unknown) {
      console.error("Failed to upgrade to owner:", err);
      const error = err as Error;
      setNotice({ type: 'error', message: error.message || 'Failed to register as bus operator.' });
    } finally {
      setBecomingOwner(false);
    }
  };

  const toggleBusStatus = async (busId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'maintenance' : 'active';
    try {
      await update(ref(db, `buses/${busId}`), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
      setBuses(prev => prev.map(b => b.id === busId ? { ...b, status: nextStatus as Bus['status'] } : b));
    } catch (err) {
      console.error("Failed to toggle bus status:", err);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 text-center shadow-lg">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4">
            <BusIcon className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">Bus Operator Portal</h2>
          <p className="text-sm text-slate-500 mb-6">
            Please sign in to your operator account to manage your bus fleet and add new buses.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md cursor-pointer"
          >
            Sign In to Continue
          </button>
        </div>
      </div>
    );
  }

  // If user is a passenger, show the Operator Onboarding Card
  if (!isOwner && !isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        {notice && (
          <div className={`p-4 rounded-xl text-sm font-semibold mb-6 flex items-center gap-3 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {notice.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span>{notice.message}</span>
          </div>
        )}

        <div className="bg-gradient-to-tr from-slate-900 to-slate-800 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden">
          <div className="max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-300 border border-orange-500/30 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider mb-6">
              <ShieldCheck className="w-4 h-4" /> Bus Operator Registration
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
              Register Your Bus Fleet on LankaBus
            </h1>
            <p className="text-slate-300 text-base leading-relaxed mb-8">
              Join Sri Lanka’s verified online private bus network. List your luxury, expressway, and intercity buses to receive passenger reservations across all major routes.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-sm">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Real-Time Seat Management</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Instant PayHere Settlements</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Conductor Mobile QR Verification</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Zero Monthly Upfront Fees</span>
              </div>
            </div>

            <button
              onClick={handleBecomeOwner}
              disabled={becomingOwner}
              className="bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold px-8 py-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {becomingOwner ? 'Registering Operator Account...' : 'Register as Bus Owner & Start Adding Buses'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {notice && (
        <div className={`p-4 rounded-xl text-sm font-semibold mb-6 flex items-center gap-3 ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {notice.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{notice.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800">{t('title')}</h1>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {buses.length} {buses.length === 1 ? 'Bus' : 'Buses'}
            </span>
          </div>
          <p className="text-slate-500 text-sm mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/owner/trips"
            className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-3 rounded-xl transition cursor-pointer text-sm"
          >
            <Calendar className="w-4 h-4 text-orange-600" />
            <span>Scheduled Trips & Fares</span>
          </Link>
          <Link
            href="/owner/buses/new"
            className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold px-5 py-3 rounded-xl transition shadow-md hover:shadow-lg cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t('addNewBus')}</span>
          </Link>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 font-medium text-sm">Loading your registered fleet...</p>
        </div>
      ) : buses.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-4">
            <BusIcon className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">{t('noBuses')}</h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            {t('noBusesDesc')}
          </p>
          <Link
            href="/owner/buses/new"
            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold px-6 py-3 rounded-xl transition shadow-md cursor-pointer text-sm"
          >
            <Plus className="w-5 h-5" />
            <span>{t('addFirstBus')}</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {buses.map((bus) => (
            <div 
              key={bus.id} 
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition overflow-hidden flex flex-col"
            >
              <div className="p-6 flex-1">
                {/* Status Badge & Reg Number */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className="font-mono text-xs font-black tracking-wider bg-amber-300 text-slate-950 px-2.5 py-1 rounded-md border border-slate-900 shadow-2xs select-none">
                    {bus.regNumber}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full capitalize ${bus.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {bus.status}
                  </span>
                </div>

                {/* Bus Name & Type */}
                <h3 className="text-lg font-black text-slate-800 truncate mb-1">
                  {bus.name}
                </h3>
                <p className="text-xs font-semibold text-orange-600 mb-4">
                  {bus.type}
                </p>

                {/* Specifications */}
                <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 text-xs mb-4">
                  <div>
                    <span className="text-slate-400 block">Total Seats</span>
                    <span className="font-bold text-slate-700">{bus.totalSeats} Passenger Seats</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Seat Layout</span>
                    <span className="font-bold text-slate-700">
                      {bus.seatLayout?.rows || 10} Rows • {
                        (bus.seatLayout?.type === '2x3' || bus.seatLayout?.type === '3:2' || bus.seatLayout?.cols === 5)
                          ? '2x3 Normal'
                          : (bus.seatLayout?.type === '2+1' || bus.seatLayout?.cols === 3)
                          ? '2+1 VIP'
                          : '2x2 Luxury'
                      }
                    </span>
                  </div>
                </div>

                {/* Amenities Icons */}
                {bus.amenities && bus.amenities.length > 0 && (
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">Amenities</span>
                    <div className="flex flex-wrap gap-1.5">
                      {bus.amenities.map((item, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 text-[11px] px-2.5 py-1 rounded-md border border-slate-200">
                          {item.includes('AC') && <Snowflake className="w-3 h-3 text-sky-500" />}
                          {item.includes('Wi-Fi') && <Wifi className="w-3 h-3 text-indigo-500" />}
                          {item.includes('Charging') && <Zap className="w-3 h-3 text-amber-500" />}
                          {item.includes('TV') && <Tv className="w-3 h-3 text-rose-500" />}
                          {item.includes('Luggage') && <Briefcase className="w-3 h-3 text-emerald-500" />}
                          <span>{item}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer Controls */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
                <Link
                  href={`/owner/trips/new?busId=${bus.id}`}
                  className="font-bold text-orange-600 hover:text-orange-800 flex items-center gap-1 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Trip & Fare</span>
                </Link>
                <button
                  onClick={() => toggleBusStatus(bus.id, bus.status)}
                  className="font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  {bus.status === 'active' ? 'Set Maintenance' : 'Set Active'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
