"use client";

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useRouter } from '@/i18n/routing';
import { Trip } from '@/types/trip';
import { 
  Bus as BusIcon, 
  Calendar, 
  ArrowRight, 
  ShieldCheck, 
  Filter, 
  Snowflake, 
  Wifi, 
  Zap, 
  Briefcase, 
  Tv,
  ChevronLeft,
  ChevronRight,
  Armchair
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { matchLocation } from '@/data/sriLankaBusStands';

function SearchResults() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from')?.toLowerCase().trim();
  const to = searchParams.get('to')?.toLowerCase().trim();
  const date = searchParams.get('date');
  const router = useRouter();
  const t = useTranslations('search');
  
  const currentQueryKey = `${from || ''}-${to || ''}-${date || ''}`;
  const [prevQueryKey, setPrevQueryKey] = useState(currentQueryKey);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(Boolean(from && to && date));

  // Filters & Sorting
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'ac' | 'semi' | 'vip'>('all');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');
  const [sortBy, setSortBy] = useState<'time' | 'priceAsc' | 'priceDesc' | 'seats'>('time');

  if (prevQueryKey !== currentQueryKey) {
    setPrevQueryKey(currentQueryKey);
    setLoading(Boolean(from && to && date));
  }

  useEffect(() => {
    if (!from || !to || !date) return;

    let isCancelled = false;

    // Query Realtime Database by departureDate index
    const tripsRef = query(ref(db, 'trips'), orderByChild('departureDate'), equalTo(date));
    get(tripsRef).then((snapshot) => {
      if (isCancelled) return;
      if (snapshot.exists()) {
        const matched: Trip[] = [];
        snapshot.forEach((snap) => {
          const tripData = snap.val() as Omit<Trip, 'id'>;

          // Skip non-scheduled trips
          if (tripData.status && tripData.status !== 'scheduled') {
            return;
          }

          const rStart = tripData.routeSnapshot?.startCity || '';
          const rEnd = tripData.routeSnapshot?.endCity || '';

          // 1. Direct Route Match (tolerant to terminal names, aliases, and parent cities)
          if (matchLocation(from, rStart) && matchLocation(to, rEnd)) {
            matched.push({ id: snap.key as string, ...tripData });
            return;
          }

          // 2. Intermediate Stops Match (Respecting direction)
          if (tripData.routeSnapshot?.stops && Array.isArray(tripData.routeSnapshot.stops)) {
            const allStops = [
              rStart,
              ...tripData.routeSnapshot.stops.map(s => s.city),
              rEnd
            ].filter(Boolean);

            const fromIdx = allStops.findIndex(s => matchLocation(from, s));
            const toIdx = allStops.findIndex(s => matchLocation(to, s));

            if (fromIdx !== -1 && toIdx !== -1 && fromIdx < toIdx) {
              matched.push({ id: snap.key as string, ...tripData });
            }
          }
        });

        setTrips(matched);
      } else {
        setTrips([]);
      }
      setLoading(false);
    }).catch((err) => {
      console.error("Search query error:", err);
      if (!isCancelled) setLoading(false);
    });

    return () => {
      isCancelled = true;
    };
  }, [from, to, date]);

  // Date Navigation (-1 day / +1 day)
  const handleDateShift = (deltaDays: number) => {
    if (!date) return;
    const current = new Date(date);
    current.setDate(current.getDate() + deltaDays);
    const newDateStr = current.toISOString().split('T')[0];
    router.push(`/search?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}&date=${encodeURIComponent(newDateStr)}`);
  };

  // Filter and Sort Trips
  const filteredAndSortedTrips = useMemo(() => {
    const result = trips.filter(trip => {
      const busType = (trip.busSnapshot?.type || '').toLowerCase();
      
      // Type Filter
      if (selectedTypeFilter === 'ac' && !busType.includes('ac') && !busType.includes('luxury')) return false;
      if (selectedTypeFilter === 'semi' && !busType.includes('semi')) return false;
      if (selectedTypeFilter === 'vip' && !busType.includes('vip')) return false;

      // Time Filter
      if (selectedTimeFilter !== 'all' && trip.departureTime) {
        const hour = parseInt(trip.departureTime.split(':')[0], 10);
        if (selectedTimeFilter === 'morning' && (hour < 4 || hour >= 12)) return false;
        if (selectedTimeFilter === 'afternoon' && (hour < 12 || hour >= 18)) return false;
        if (selectedTimeFilter === 'night' && (hour >= 4 && hour < 18)) return false;
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      const fareA = Number(a.farePerSeat || a.baseFare);
      const fareB = Number(b.farePerSeat || b.baseFare);

      if (sortBy === 'priceAsc') return fareA - fareB;
      if (sortBy === 'priceDesc') return fareB - fareA;
      if (sortBy === 'seats') {
        const bookedA = a.bookedSeats ? Object.keys(a.bookedSeats).length : 0;
        const bookedB = b.bookedSeats ? Object.keys(b.bookedSeats).length : 0;
        const seatsLeftA = (a.busSnapshot?.totalSeats || 52) - bookedA;
        const seatsLeftB = (b.busSnapshot?.totalSeats || 52) - bookedB;
        return seatsLeftB - seatsLeftA;
      }
      // default: departureTime
      return (a.departureTime || '').localeCompare(b.departureTime || '');
    });

    return result;
  }, [trips, selectedTypeFilter, selectedTimeFilter, sortBy]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-4 py-8 space-y-4">
        <div className="h-20 bg-white rounded-2xl border border-slate-200 animate-pulse"></div>
        {[1, 2, 3].map((n) => (
          <div key={n} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-pulse flex flex-col md:flex-row justify-between gap-6">
            <div className="space-y-3 flex-1">
              <div className="h-5 bg-slate-200 rounded w-1/3"></div>
              <div className="h-8 bg-slate-200 rounded w-2/3"></div>
              <div className="h-4 bg-slate-200 rounded w-1/2"></div>
            </div>
            <div className="h-16 bg-slate-200 rounded w-36 self-end md:self-center"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Route Search Header Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl shadow-sm border border-slate-200/90 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xl sm:text-2xl md:text-3xl font-black text-slate-800 capitalize tracking-tight">
              <span>{from || 'Origin'}</span>
              <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 shrink-0" />
              <span>{to || 'Destination'}</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500 mt-2">
              <span className="flex items-center gap-1.5 font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
                <Calendar className="w-3.5 h-3.5 text-orange-500" />
                {date}
              </span>
              <span>&bull;</span>
              <span className="text-orange-600 font-bold">
                {trips.length} {trips.length === 1 ? 'Bus Available' : 'Buses Available'}
              </span>
              <span>&bull;</span>
              <span className="text-slate-400 font-medium">
                Individual bus fares configured
              </span>
            </div>
          </div>

          {/* Quick Date Switcher & Modify */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDateShift(-1)}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDateShift(1)}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => router.push('/')} 
              className="text-orange-600 font-bold text-xs hover:text-orange-700 bg-orange-50 px-4 py-2.5 rounded-xl border border-orange-200 transition cursor-pointer"
            >
              {t('modifySearch')}
            </button>
          </div>
        </div>

        {/* Commercial Filter & Sort Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Bus Type:
            </span>
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'all' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t('filterAll')}
            </button>
            <button
              onClick={() => setSelectedTypeFilter('ac')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'ac' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t('filterAC')}
            </button>
            <button
              onClick={() => setSelectedTypeFilter('semi')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'semi' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t('filterSemi')}
            </button>
            <button
              onClick={() => setSelectedTypeFilter('vip')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'vip' ? 'bg-purple-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {t('filterVIP')}
            </button>

            <span className="text-slate-300 mx-1">|</span>

            {/* Time of Day Filter */}
            <button
              onClick={() => setSelectedTimeFilter('all')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'all' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Times
            </button>
            <button
              onClick={() => setSelectedTimeFilter('morning')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'morning' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Morning
            </button>
            <button
              onClick={() => setSelectedTimeFilter('afternoon')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'afternoon' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Afternoon
            </button>
            <button
              onClick={() => setSelectedTimeFilter('night')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'night' ? 'bg-slate-800 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Night
            </button>
          </div>

          {/* Sort Dropdown / Selector */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 font-bold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-slate-100 border border-slate-200 font-bold text-slate-700 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              <option value="time">{t('sortTime')}</option>
              <option value="priceAsc">{t('sortPriceAsc')}</option>
              <option value="priceDesc">{t('sortPriceDesc')}</option>
              <option value="seats">{t('sortSeats')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* No Buses State */}
      {filteredAndSortedTrips.length === 0 ? (
        <div className="text-center p-12 sm:p-16 bg-white rounded-3xl border border-slate-200/90 shadow-sm max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BusIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">{t('noBusesFound')}</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            {t('tryDifferent')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button 
              onClick={() => handleDateShift(1)} 
              className="bg-orange-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-orange-700 transition shadow-sm text-sm"
            >
              Check Next Day &rarr;
            </button>
            <button 
              onClick={() => router.push('/')} 
              className="bg-slate-100 text-slate-700 font-bold px-6 py-3 rounded-xl hover:bg-slate-200 transition text-sm"
            >
              Search Other Routes
            </button>
          </div>
        </div>
      ) : (
        /* Results List */
        <div className="space-y-4">
          {filteredAndSortedTrips.map(trip => {
            const bookedCount = trip.bookedSeats ? Object.keys(trip.bookedSeats).length : 0;
            const totalSeats = trip.busSnapshot?.totalSeats || 52;
            const seatsLeft = Math.max(0, totalSeats - bookedCount);
            const isFillingFast = seatsLeft <= 6 && seatsLeft > 0;
            const individualFare = Number(trip.farePerSeat || trip.baseFare);
            const busLayout = trip.busSnapshot?.seatLayout?.type || (trip.busSnapshot?.seatLayout?.cols === 5 ? '2x3' : '2x2');

            return (
              <div 
                key={trip.id} 
                className="bg-white p-5 sm:p-7 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group"
              >
                {/* Left & Center: Bus Identity, Timeline, Amenities */}
                <div className="flex-1">
                  
                  {/* Top Header: Bus Operator, Reg Number, Layout Badges */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="font-black text-lg sm:text-xl text-slate-900 group-hover:text-orange-600 transition tracking-tight">
                      {trip.operatorName || trip.busSnapshot?.name || 'LankaBus Express'}
                    </span>

                    <span className="font-mono text-xs font-black bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-lg border border-slate-200">
                      {trip.busSnapshot?.regNumber || 'VEHICLE'}
                    </span>

                    <span className="px-2.5 py-0.5 text-xs font-bold bg-orange-50 text-orange-700 border border-orange-100 rounded-full">
                      {trip.busSnapshot?.type || 'Luxury Coach'}
                    </span>

                    {/* Sri Lanka Layout Badge */}
                    <span className="px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-600 rounded-full">
                      {busLayout === '2x3' ? '2x3 Normal' : busLayout === '2+1' ? '2+1 VIP' : '2x2 Luxury'}
                    </span>

                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 ml-auto md:ml-0">
                      <ShieldCheck className="w-3.5 h-3.5" /> {t('operatorCertified')}
                    </span>
                  </div>

                  {/* Journey Timeline */}
                  <div className="flex items-center gap-4 sm:gap-8 my-4 py-2 border-y border-slate-100">
                    {/* Departure */}
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                        {trip.departureTime}
                      </div>
                      <div className="text-xs font-bold text-slate-700 capitalize mt-0.5">
                        {from}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {t('boardingPoint')}
                      </div>
                    </div>

                    {/* Middle Route Duration & Line */}
                    <div className="flex-1 flex flex-col items-center px-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                        {trip.duration || 'Direct Expressway'}
                      </span>
                      <div className="w-full max-w-[140px] h-0.5 bg-slate-200 relative my-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-500 absolute -top-1 left-1/2 -translate-x-1/2 ring-4 ring-orange-100"></div>
                      </div>
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                        {t('directExpressway')}
                      </span>
                    </div>

                    {/* Arrival */}
                    <div className="text-right">
                      <div className="text-2xl sm:text-3xl font-black text-slate-700 font-mono tracking-tight">
                        {trip.arrivalTime || 'Scheduled'}
                      </div>
                      <div className="text-xs font-bold text-slate-700 capitalize mt-0.5">
                        {to}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {t('droppingPoint')}
                      </div>
                    </div>
                  </div>

                  {/* Amenities Row & Seats Available Indicator */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    {/* Amenities */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {trip.busSnapshot?.amenities && trip.busSnapshot.amenities.length > 0 ? (
                        trip.busSnapshot.amenities.map((amenity, i) => (
                          <span 
                            key={i} 
                            className="inline-flex items-center gap-1 bg-slate-50 text-slate-600 px-2 py-1 rounded-md text-[10.5px] font-semibold border border-slate-200/80"
                          >
                            {amenity.includes('AC') && <Snowflake className="w-3 h-3 text-sky-500" />}
                            {amenity.includes('Wi-Fi') && <Wifi className="w-3 h-3 text-indigo-500" />}
                            {amenity.includes('Charging') && <Zap className="w-3 h-3 text-amber-500" />}
                            {amenity.includes('Reclining') && <Armchair className="w-3 h-3 text-purple-500" />}
                            {amenity.includes('Luggage') && <Briefcase className="w-3 h-3 text-emerald-500" />}
                            {amenity.includes('TV') && <Tv className="w-3 h-3 text-rose-500" />}
                            <span>{amenity}</span>
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400">Standard Transit Amenities</span>
                      )}
                    </div>

                    {/* Seat availability badge */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${isFillingFast ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-700'}`}>
                        {seatsLeft} {t('seatsAvailable')}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Right: Individual Bus Fare Section & Action CTA */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-56 gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                      {t('individualFare')}
                    </span>
                    <div className="flex items-baseline gap-1 md:justify-end">
                      <span className="text-xs font-bold text-slate-400">Rs.</span>
                      <span className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight">
                        {individualFare.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 block">
                      {t('perSeat')}
                    </span>
                  </div>

                  <button 
                    onClick={() => router.push(`/book/${trip.id}`)}
                    className="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white px-6 py-3.5 rounded-2xl shadow-md hover:shadow-lg font-black text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span>{t('selectBusSeats')}</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
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

export default function SearchPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Suspense fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 font-medium">Loading available buses and individual fares...</p>
        </div>
      }>
        <SearchResults />
      </Suspense>
    </div>
  );
}
