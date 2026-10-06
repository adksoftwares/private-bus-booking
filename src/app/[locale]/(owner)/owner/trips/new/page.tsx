"use client";

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ref, get } from 'firebase/database';
import { db } from '@/lib/firebase';
import { Bus } from '@/types/bus';
import { 
  ArrowLeft, 
  Calendar, 
  Bus as BusIcon, 
  ShieldCheck, 
  Plus, 
  Trash2, 
  AlertCircle,
  Sparkles,
  Info
} from 'lucide-react';
import CityAutocomplete from '@/components/shared/CityAutocomplete';
import { useSearchParams } from 'next/navigation';

export default function NewTripPage() {
  const { user, isAdmin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryBusId = searchParams.get('busId');
  const t = useTranslations('trips');

  const [buses, setBuses] = useState<Bus[]>([]);
  const [loadingBuses, setLoadingBuses] = useState(true);

  // Form State
  const [selectedBusId, setSelectedBusId] = useState(queryBusId || '');
  const [startCity, setStartCity] = useState('Colombo');
  const [endCity, setEndCity] = useState('Jaffna');
  const [stops, setStops] = useState<{ city: string; stopName: string }[]>([]);
  const [newStopCity, setNewStopCity] = useState('');
  const [newStopName, setNewStopName] = useState('');

  // Default travel date: tomorrow
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);
  const [departureDate, setDepartureDate] = useState(tomorrow);

  const [departureTime, setDepartureTime] = useState('08:00');
  const [arrivalTime, setArrivalTime] = useState('14:30');
  const [duration, setDuration] = useState('6h 30m');
  const [farePerSeat, setFarePerSeat] = useState<number | ''>(2800);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load Owner's Buses from Firebase
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const busesRef = ref(db, 'buses');

    get(busesRef).then((snap) => {
      if (!isMounted) return;
      if (snap.exists()) {
        const list: Bus[] = [];
        snap.forEach((childSnap) => {
          const busData = childSnap.val() as Omit<Bus, 'id'>;
          if (isAdmin || busData.ownerId === user.uid) {
            list.push({ id: childSnap.key as string, ...busData });
          }
        });
        setBuses(list);
        if (list.length > 0) {
          const targetId = (queryBusId && list.some(b => b.id === queryBusId)) ? queryBusId : list[0].id;
          setSelectedBusId(targetId);
          const targetBus = list.find(b => b.id === targetId) || list[0];
          if (targetBus.type.includes('VIP')) setFarePerSeat(3800);
          else if (targetBus.type.includes('Luxury')) setFarePerSeat(2800);
          else if (targetBus.type.includes('Semi')) setFarePerSeat(2200);
          else setFarePerSeat(1900);
        }
      } else {
        setBuses([]);
      }
      setLoadingBuses(false);
    }).catch((err) => {
      console.error("Failed to load buses:", err);
      if (isMounted) setLoadingBuses(false);
    });

    return () => {
      isMounted = false;
    };
  }, [user, isAdmin, queryBusId]);

  const updateDuration = (dep: string, arr: string) => {
    if (!dep || !arr) return;
    const [dH, dM] = dep.split(':').map(Number);
    const [aH, aM] = arr.split(':').map(Number);
    let diff = (aH * 60 + aM) - (dH * 60 + dM);
    if (diff < 0) diff += 24 * 60; // crosses midnight
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    setDuration(`${hours}h ${mins > 0 ? `${mins}m` : '00m'}`);
  };

  const selectedBus = buses.find(b => b.id === selectedBusId);

  const handleBusChange = (busId: string) => {
    setSelectedBusId(busId);
    const bus = buses.find(b => b.id === busId);
    if (bus) {
      if (bus.type.includes('VIP')) setFarePerSeat(3800);
      else if (bus.type.includes('Luxury')) setFarePerSeat(2800);
      else if (bus.type.includes('Semi')) setFarePerSeat(2200);
      else setFarePerSeat(1900);
    }
  };

  const handleAddStop = () => {
    if (!newStopCity.trim()) return;
    setStops(prev => [...prev, { city: newStopCity.trim(), stopName: newStopName.trim() || 'Bus Stand' }]);
    setNewStopCity('');
    setNewStopName('');
  };

  const handleRemoveStop = (index: number) => {
    setStops(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg("Please sign in to schedule trips.");
      return;
    }

    if (!selectedBusId) {
      setErrorMsg("Please select a bus from your fleet.");
      return;
    }

    if (!startCity.trim() || !endCity.trim()) {
      setErrorMsg("Origin and Destination cities are required.");
      return;
    }

    if (startCity.trim().toLowerCase() === endCity.trim().toLowerCase()) {
      setErrorMsg("Origin and Destination cannot be the same city.");
      return;
    }

    if (!farePerSeat || Number(farePerSeat) <= 0) {
      setErrorMsg("Please enter a valid individual ticket fare per passenger.");
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          busId: selectedBusId,
          startCity: startCity.trim(),
          endCity: endCity.trim(),
          stops,
          departureDate,
          departureTime,
          arrivalTime,
          duration,
          farePerSeat: Number(farePerSeat),
          userId: user.uid
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule trip');
      }

      router.push('/owner/trips');
    } catch (err: unknown) {
      console.error("Save trip error:", err);
      const errObj = err as Error;
      setErrorMsg(errObj.message || 'Failed to save scheduled trip.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Back Link */}
      <div className="mb-6">
        <Link 
          href="/owner/trips"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Scheduled Trips</span>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: Input Form */}
        <div className="flex-1 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-xs">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800">{t('scheduleNewTrip')}</h1>
              <p className="text-xs sm:text-sm text-slate-500">Associate a bus with a route and set its individual passenger fare</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold mb-6 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loadingBuses ? (
            <div className="py-12 text-center text-slate-400">Loading your registered fleet...</div>
          ) : buses.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              <BusIcon className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h3 className="font-bold text-slate-700 text-base mb-1">No Buses Registered</h3>
              <p className="text-xs text-slate-500 mb-4">You need to register at least one bus in your fleet before scheduling trips.</p>
              <Link
                href="/owner/buses/new"
                className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Register Bus</span>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSaveTrip} className="space-y-6">
              {/* Step 1: Select Bus */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. {t('selectBus')} *
                </label>
                <select
                  value={selectedBusId}
                  onChange={(e) => handleBusChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 transition bg-white"
                >
                  {buses.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.name} ({bus.regNumber}) &bull; {bus.type} &bull; {bus.totalSeats} Seats
                    </option>
                  ))}
                </select>

                {selectedBus && (
                  <div className="mt-2.5 p-3 rounded-xl bg-orange-50/70 border border-orange-100 flex items-center justify-between text-xs text-orange-950">
                    <div>
                      <strong className="font-black">{selectedBus.name}</strong> ({selectedBus.regNumber})
                      <div className="text-[11px] text-orange-800">
                        {selectedBus.type} &bull; {selectedBus.totalSeats} Seats &bull; {selectedBus.seatLayout?.type || '2x2'} Layout
                      </div>
                    </div>
                    {selectedBus.amenities && selectedBus.amenities.length > 0 && (
                      <span className="text-[10px] bg-white px-2 py-1 rounded font-bold text-orange-700 border border-orange-200">
                        {selectedBus.amenities.length} Amenities
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Route (Origin & Destination) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    2. {t('originCity')} *
                  </label>
                  <CityAutocomplete
                    value={startCity}
                    onChange={setStartCity}
                    placeholder="Search origin town or terminal (e.g. Colombo, Bastian Mawatha)..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {t('destinationCity')} *
                  </label>
                  <CityAutocomplete
                    value={endCity}
                    onChange={setEndCity}
                    placeholder="Search destination town or terminal (e.g. Jaffna, Kandy Goodshed)..."
                  />
                </div>
              </div>

              {/* Intermediate Stops */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Intermediate Stops (Optional)
                  </span>
                  <span className="text-[11px] text-slate-400">Passengers can board along these cities</span>
                </div>

                {stops.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {stops.map((stop, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200 text-xs">
                        <span className="font-semibold text-slate-700">{idx + 1}. {stop.city} {stop.stopName ? `(${stop.stopName})` : ''}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(idx)}
                          className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 items-start">
                  <div className="flex-1 w-full">
                    <CityAutocomplete
                      value={newStopCity}
                      onChange={setNewStopCity}
                      placeholder="Type intermediate town or bus stand..."
                      onSelectStand={(stand) => {
                        setNewStopCity(stand.name);
                        if (!newStopName) setNewStopName(`${stand.town} Bus Stand`);
                      }}
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Stop label (e.g. Clock Tower)"
                    value={newStopName}
                    onChange={(e) => setNewStopName(e.target.value)}
                    className="w-full sm:w-52 p-2.5 rounded-xl border border-slate-300 text-xs bg-white font-medium outline-none focus:border-orange-500"
                  />

                  <button
                    type="button"
                    onClick={handleAddStop}
                    className="w-full sm:w-auto bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer shrink-0"
                  >
                    Add Stop
                  </button>
                </div>
              </div>

              {/* Step 3: Date and Timing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    3. {t('travelDate')} *
                  </label>
                  <input
                    type="date"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {t('departureTime')} *
                  </label>
                  <input
                    type="time"
                    required
                    value={departureTime}
                    onChange={(e) => {
                      setDepartureTime(e.target.value);
                      updateDuration(e.target.value, arrivalTime);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    {t('arrivalTime')}
                  </label>
                  <input
                    type="time"
                    value={arrivalTime}
                    onChange={(e) => {
                      setArrivalTime(e.target.value);
                      updateDuration(departureTime, e.target.value);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-orange-500 transition font-mono"
                  />
                </div>
              </div>

              {/* Step 4: Individual Bus Fare Configuration */}
              <div className="p-5 rounded-2xl bg-orange-50/50 border-2 border-orange-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-black text-orange-950 uppercase tracking-wider">
                    4. {t('farePerSeat')} *
                  </label>
                  <span className="text-xs font-black text-orange-600 bg-white px-2.5 py-1 rounded-md border border-orange-200 shadow-2xs">
                    Bus-Specific Price
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                  {t('fareHelper')}
                </p>

                <div className="relative mb-3">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-slate-400 text-sm">
                    Rs.
                  </span>
                  <input
                    type="number"
                    required
                    min="100"
                    max="50000"
                    placeholder={t('farePlaceholder')}
                    value={farePerSeat}
                    onChange={(e) => setFarePerSeat(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-orange-300 text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white shadow-xs"
                  />
                </div>

                {/* Quick Fare Presets based on Sri Lankan tiers */}
                <div className="flex flex-wrap gap-2">
                  <span className="text-[11px] font-bold text-slate-500 self-center mr-1">Presets:</span>
                  {[1800, 2000, 2200, 2500, 2800, 3200, 3800, 4200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFarePerSeat(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${farePerSeat === preset ? 'bg-orange-600 text-white shadow-2xs' : 'bg-white text-slate-700 border border-slate-200 hover:border-orange-300'}`}
                    >
                      Rs. {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold py-4 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('scheduling')}</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" />
                      <span>{t('scheduleTrip')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Live Trip Summary Card */}
        <div className="w-full lg:w-84 flex flex-col">
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl sticky top-24">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-800">
              <Sparkles className="w-4 h-4 text-orange-400" />
              <h3 className="font-bold text-sm tracking-wide text-slate-200">Scheduled Trip Summary</h3>
            </div>

            <div className="space-y-4 text-xs">
              {/* Bus Details */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Assigned Bus</span>
                {selectedBus ? (
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                    <div className="font-black text-slate-200 text-sm">{selectedBus.name}</div>
                    <div className="font-mono text-[11px] text-orange-400">{selectedBus.regNumber}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{selectedBus.type} &bull; {selectedBus.totalSeats} Seats</div>
                  </div>
                ) : (
                  <span className="text-slate-500 italic">No bus selected</span>
                )}
              </div>

              {/* Route */}
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Route</span>
                <div className="text-sm font-black text-slate-200">
                  {startCity} &rarr; {endCity}
                </div>
                {stops.length > 0 && (
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Via {stops.map(s => s.city).join(', ')}
                  </div>
                )}
              </div>

              {/* Schedule */}
              <div className="grid grid-cols-2 gap-2 py-3 border-y border-slate-800">
                <div>
                  <span className="text-[10px] text-slate-500 block">Date</span>
                  <span className="font-bold text-slate-200">{departureDate}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Time</span>
                  <span className="font-bold text-slate-200">{departureTime} - {arrivalTime}</span>
                </div>
              </div>

              {/* Individual Fare Breakdown */}
              <div className="p-4 rounded-2xl bg-orange-500/10 border border-orange-500/30">
                <span className="text-[10px] font-bold text-orange-300 uppercase tracking-wider block mb-1">
                  Individual Ticket Fare
                </span>
                <div className="text-2xl font-black text-orange-400">
                  Rs. {Number(farePerSeat || 0).toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">per passenger seat</span>

                {selectedBus && farePerSeat && (
                  <div className="mt-3 pt-2 border-t border-orange-500/20 flex justify-between text-[11px]">
                    <span className="text-slate-400">Potential Gross:</span>
                    <span className="font-bold text-slate-200">
                      Rs. {(selectedBus.totalSeats * Number(farePerSeat)).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-start gap-2 text-[11px] text-slate-400">
              <Info className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
              <span>Passengers searching on {startCity} &rarr; {endCity} will immediately see this bus and its specific fare.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
