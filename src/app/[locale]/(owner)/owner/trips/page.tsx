"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Trip } from '@/types/trip';
import { 
  Calendar, 
  Clock, 
  Plus, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  MapPin, 
  RefreshCw, 
  Ban, 
  Eye,
  Bus as BusIcon,
  Tag
} from 'lucide-react';

export default function OwnerTripsPage() {
  const { user, isAdmin, authFetch } = useAuth();
  const router = useRouter();
  const t = useTranslations('trips');

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'scheduled' | 'cancelled'>('all');

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    const url = isAdmin ? '/api/trips' : `/api/trips?ownerId=${user.uid}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (isMounted) {
          setTrips(data.trips || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          console.error("Fetch trips error:", err);
          setNotice({ type: 'error', message: 'Network error loading trips' });
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin]);

  const handleToggleTripStatus = async (tripId: string, currentStatus: string) => {
    if (!user) return;
    setUpdatingId(tripId);
    setNotice(null);

    const nextStatus = currentStatus === 'cancelled' ? 'scheduled' : 'cancelled';

    try {
      const res = await authFetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: nextStatus
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTrips(prev => prev.map(t => t.id === tripId ? { ...t, status: nextStatus as Trip['status'] } : t));
        setNotice({ 
          type: 'success', 
          message: nextStatus === 'cancelled' ? 'Trip has been marked as cancelled.' : 'Trip has been reactivated for booking.' 
        });
      } else {
        setNotice({ type: 'error', message: data.error || 'Failed to update trip status' });
      }
    } catch (err: unknown) {
      console.error("Update trip error:", err);
      setNotice({ type: 'error', message: 'Failed to update trip' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateFare = async (tripId: string, currentFare: number) => {
    if (!user) return;
    const input = prompt("Enter new individual ticket fare per passenger (Rs.):", currentFare.toString());
    if (!input) return;

    const newFare = parseFloat(input);
    if (isNaN(newFare) || newFare <= 0) {
      alert("Please enter a valid positive number for the fare.");
      return;
    }

    setUpdatingId(tripId);
    try {
      const res = await authFetch(`/api/trips/${tripId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farePerSeat: newFare
        })
      });

      const data = await res.json();
      if (res.ok) {
        setTrips(prev => prev.map(t => t.id === tripId ? { ...t, baseFare: newFare, farePerSeat: newFare } : t));
        setNotice({ type: 'success', message: `Individual bus fare updated to Rs. ${newFare.toFixed(2)}.` });
      } else {
        setNotice({ type: 'error', message: data.error || 'Failed to update fare' });
      }
    } catch (err: unknown) {
      console.error("Update fare error:", err);
      setNotice({ type: 'error', message: 'Failed to update ticket fare' });
    } finally {
      setUpdatingId(null);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-3xl border border-slate-200 text-center shadow-xl">
          <Calendar className="w-12 h-12 text-orange-600 mx-auto mb-3" />
          <h2 className="text-2xl font-black text-slate-800 mb-2">Operator Portal</h2>
          <p className="text-sm text-slate-500 mb-6">Please sign in to manage your bus trip schedules and fares.</p>
          <button 
            onClick={() => router.push('/login')} 
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const filteredTrips = trips.filter(t => {
    if (filterTab === 'all') return true;
    if (filterTab === 'scheduled') return t.status === 'scheduled';
    if (filterTab === 'cancelled') return t.status === 'cancelled';
    return true;
  });

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
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{t('title')}</h1>
            <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">
              {trips.length} {trips.length === 1 ? 'Trip' : 'Trips'}
            </span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/owner/trips/new"
            className="inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold px-5 py-3 rounded-xl transition shadow-md hover:shadow-lg cursor-pointer text-xs sm:text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t('scheduleNewTrip')}</span>
          </Link>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'all' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          All Trips ({trips.length})
        </button>
        <button
          onClick={() => setFilterTab('scheduled')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'scheduled' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Scheduled & Active ({trips.filter(t => t.status === 'scheduled').length})
        </button>
        <button
          onClick={() => setFilterTab('cancelled')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'cancelled' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Cancelled ({trips.filter(t => t.status === 'cancelled').length})
        </button>
      </div>

      {/* Trips Content */}
      {loading ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 font-medium text-sm">Loading scheduled trips & fares...</p>
        </div>
      ) : filteredTrips.length === 0 ? (
        <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-12 text-center max-w-lg mx-auto shadow-2xs">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto mb-4 shadow-2xs">
            <Calendar className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">{t('noTrips')}</h3>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">{t('noTripsDesc')}</p>
          <Link
            href="/owner/trips/new"
            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold px-6 py-3 rounded-xl transition shadow-md cursor-pointer text-sm"
          >
            <Plus className="w-5 h-5" />
            <span>{t('scheduleFirstTrip')}</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTrips.map((trip) => {
            const bookedCount = trip.bookedSeats ? Object.keys(trip.bookedSeats).length : 0;
            const totalSeats = trip.busSnapshot?.totalSeats || 52;
            const isUpdating = updatingId === trip.id;
            const fare = Number(trip.farePerSeat || trip.baseFare);
            const occupancyPct = Math.min(100, Math.round((bookedCount / totalSeats) * 100));

            return (
              <div
                key={trip.id}
                className={`bg-white rounded-3xl border transition-all p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-xs hover:shadow-md ${trip.status === 'cancelled' ? 'border-red-200 bg-red-50/20 opacity-80' : 'border-slate-200/90'}`}
              >
                {/* Left: Bus & Route Info */}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2.5 mb-3">
                    {trip.busSnapshot?.regNumber ? (
                      <span className="font-mono text-xs font-black tracking-wider bg-amber-300 text-slate-950 px-2.5 py-0.5 rounded-md border border-slate-900 shadow-2xs select-none">
                        {trip.busSnapshot.regNumber}
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-black bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded-md border border-slate-200">
                        BUS
                      </span>
                    )}
                    
                    <span className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <BusIcon className="w-3.5 h-3.5 text-slate-400" />
                      {trip.busSnapshot?.name}
                    </span>

                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {trip.busSnapshot?.type}
                    </span>

                    <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full capitalize ${trip.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>
                      {trip.status}
                    </span>
                  </div>

                  {/* Route & Times */}
                  <div className="flex items-center gap-2 font-black text-lg text-slate-800 mb-2">
                    <span>{trip.routeSnapshot?.startCity}</span>
                    <ArrowRight className="w-4 h-4 text-orange-500" />
                    <span>{trip.routeSnapshot?.endCity}</span>
                  </div>

                  {/* Date & Intermediate Stops */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1.5 font-bold text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-orange-500" />
                      {trip.departureDate}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Dep: <strong className="text-slate-700">{trip.departureTime}</strong>
                      {trip.arrivalTime && (
                        <> &bull; Arr: <strong className="text-slate-700">{trip.arrivalTime}</strong></>
                      )}
                      {trip.duration && (
                        <span className="text-slate-400">({trip.duration})</span>
                      )}
                    </span>
                    {trip.routeSnapshot?.stops && trip.routeSnapshot.stops.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px]">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        Stops: {trip.routeSnapshot.stops.map(s => s.city).join(', ')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Middle: Bus-Specific Individual Fare & Booking Occupancy */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-6 gap-3">
                  <div className="text-left lg:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Individual Bus Fare
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-orange-600">
                        Rs. {fare.toFixed(2)}
                      </span>
                      <span className="text-[11px] text-slate-400">/ seat</span>
                    </div>
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleUpdateFare(trip.id, fare)}
                      className="text-xs font-bold text-orange-600 hover:text-orange-800 underline cursor-pointer mt-0.5 inline-flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" />
                      <span>Edit Individual Fare</span>
                    </button>
                  </div>

                  <div className="text-left lg:text-right text-xs">
                    <span className="font-bold text-slate-700">{bookedCount} of {totalSeats} Booked ({occupancyPct}%)</span>
                    <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                      <div 
                        className={`h-full rounded-full transition-all ${occupancyPct > 80 ? 'bg-red-500' : occupancyPct > 40 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                        style={{ width: `${occupancyPct}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 border-t lg:border-t-0 pt-3 lg:pt-0">
                  <Link
                    href={`/book/${trip.id}`}
                    target="_blank"
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 transition cursor-pointer shadow-2xs"
                    title="View Passenger Seat Selection"
                  >
                    <Eye className="w-4 h-4" />
                  </Link>

                  <button
                    type="button"
                    disabled={isUpdating}
                    onClick={() => handleToggleTripStatus(trip.id, trip.status)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs ${trip.status === 'cancelled' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'}`}
                  >
                    {isUpdating ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : trip.status === 'cancelled' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Reactivate</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-3.5 h-3.5" />
                        <span>Cancel Trip</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
