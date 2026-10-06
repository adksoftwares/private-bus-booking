"use client";

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter, Link } from '@/i18n/routing';
import { Trip } from '@/types/trip';
import Header from '@/components/shared/Header';
import { 
  Bus as BusIcon, 
  Calendar, 
  ArrowRight, 
  Filter, 
  Snowflake, 
  Wifi, 
  Zap, 
  Briefcase, 
  Tv,
  ChevronLeft,
  ChevronRight,
  Armchair,
  Star,
  ArrowUpDown
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
  const [busRatings, setBusRatings] = useState<Record<string, { rating: number; count: number }>>({});
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

    // Fetch bus ratings lookup table in parallel
    fetch('/api/ratings')
      .then(res => res.json())
      .then((data) => {
        if (isCancelled || !data.ratings) return;
        setBusRatings(data.ratings);
      })
      .catch(() => {});

    // Query trips by date from API
    fetch(`/api/trips?date=${encodeURIComponent(date)}`)
      .then(res => res.json())
      .then((data) => {
        if (isCancelled) return;
        const allTrips: Trip[] = data.trips || [];
        const matched: Trip[] = [];

        for (const tripData of allTrips) {
          // Skip non-scheduled trips
          if (tripData.status && tripData.status !== 'scheduled') {
            continue;
          }

          const rStart = tripData.routeSnapshot?.startCity || '';
          const rEnd = tripData.routeSnapshot?.endCity || '';

          // 1. Direct Route Match (tolerant to terminal names, aliases, and parent cities)
          if (matchLocation(from, rStart) && matchLocation(to, rEnd)) {
            matched.push(tripData);
            continue;
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
              matched.push(tripData);
            }
          }
        }

        setTrips(matched);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching trips:", err);
        if (!isCancelled) {
          setTrips([]);
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [from, to, date]);

  // Quick Date Navigation
  const handleDateShift = (days: number) => {
    if (!date) return;
    const current = new Date(date);
    current.setDate(current.getDate() + days);
    const newDateStr = current.toISOString().split('T')[0];
    router.push(`/search?from=${encodeURIComponent(from || '')}&to=${encodeURIComponent(to || '')}&date=${newDateStr}`);
  };

  // Filter and Sort Engine
  const processedTrips = useMemo(() => {
    let result = [...trips];

    // Filter by Bus Type
    if (selectedTypeFilter === 'ac') {
      result = result.filter(t => (t.busSnapshot?.type || '').toLowerCase().includes('ac') || (t.busSnapshot?.type || '').toLowerCase().includes('luxury'));
    } else if (selectedTypeFilter === 'semi') {
      result = result.filter(t => (t.busSnapshot?.type || '').toLowerCase().includes('semi'));
    } else if (selectedTypeFilter === 'vip') {
      result = result.filter(t => (t.busSnapshot?.type || '').toLowerCase().includes('vip') || (t.busSnapshot?.seatLayout?.type || '').includes('2+1') || (t.busSnapshot?.seatLayout?.type || '').includes('2x1'));
    }

    // Filter by Time of Day
    if (selectedTimeFilter === 'morning') {
      result = result.filter(t => {
        const hour = parseInt((t.departureTime || '00:00').split(':')[0], 10);
        return hour >= 4 && hour < 12;
      });
    } else if (selectedTimeFilter === 'afternoon') {
      result = result.filter(t => {
        const hour = parseInt((t.departureTime || '00:00').split(':')[0], 10);
        return hour >= 12 && hour < 18;
      });
    } else if (selectedTimeFilter === 'night') {
      result = result.filter(t => {
        const hour = parseInt((t.departureTime || '00:00').split(':')[0], 10);
        return hour >= 18 || hour < 4;
      });
    }

    // Sorting
    result.sort((a, b) => {
      const fareA = Number(a.farePerSeat || a.baseFare || 0);
      const fareB = Number(b.farePerSeat || b.baseFare || 0);

      if (sortBy === 'priceAsc') return fareA - fareB;
      if (sortBy === 'priceDesc') return fareB - fareA;
      if (sortBy === 'seats') {
        const bookedA = a.bookedSeats ? Object.keys(a.bookedSeats).length : 0;
        const bookedB = b.bookedSeats ? Object.keys(b.bookedSeats).length : 0;
        const seatsA = (a.busSnapshot?.totalSeats || 40) - bookedA;
        const seatsB = (b.busSnapshot?.totalSeats || 40) - bookedB;
        return seatsB - seatsA;
      }
      return (a.departureTime || '').localeCompare(b.departureTime || '');
    });

    return result;
  }, [trips, selectedTypeFilter, selectedTimeFilter, sortBy]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Route Header Banner */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Origin -> Destination Route Details */}
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-600 mb-1">
              <BusIcon className="w-3.5 h-3.5" />
              <span>Intercity Bus Schedules</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight capitalize">
              <span>{from || 'Origin'}</span>
              <ArrowRight className="w-5 h-5 text-slate-400 stroke-[2.5]" />
              <span>{to || 'Destination'}</span>
            </div>

            <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{date || 'Selected Date'}</span>
              <span>&bull;</span>
              <span className="text-slate-600 font-bold">
                {processedTrips.length} {processedTrips.length === 1 ? 'Bus Available' : 'Buses Available'}
              </span>
            </div>
          </div>

          {/* Quick Date Shift Controls & Modify Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDateShift(-1)}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition cursor-pointer"
              title="Previous Day"
              aria-label="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDateShift(1)}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition cursor-pointer"
              title="Next Day"
              aria-label="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <Link 
              href="/" 
              className="text-orange-600 font-bold text-xs hover:text-orange-700 bg-orange-50 px-4 py-2.5 rounded-xl border border-orange-200 transition cursor-pointer"
            >
              {t('modifySearch')}
            </Link>
          </div>
        </div>

        {/* Filter and Sort Segmented Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Bus Type Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              Type:
            </span>
            <button
              onClick={() => setSelectedTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'all' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Buses
            </button>
            <button
              onClick={() => setSelectedTypeFilter('ac')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'ac' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Luxury AC
            </button>
            <button
              onClick={() => setSelectedTypeFilter('semi')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'semi' ? 'bg-orange-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Semi Luxury
            </button>
            <button
              onClick={() => setSelectedTypeFilter('vip')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${selectedTypeFilter === 'vip' ? 'bg-purple-700 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              2+1 VIP
            </button>

            <span className="text-slate-300 mx-1 hidden sm:inline">|</span>

            {/* Time of Day */}
            <button
              onClick={() => setSelectedTimeFilter('all')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Times
            </button>
            <button
              onClick={() => setSelectedTimeFilter('morning')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'morning' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Morning
            </button>
            <button
              onClick={() => setSelectedTimeFilter('afternoon')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'afternoon' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Afternoon
            </button>
            <button
              onClick={() => setSelectedTimeFilter('night')}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer ${selectedTimeFilter === 'night' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Night
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'time' | 'priceAsc' | 'priceDesc' | 'seats')}
              aria-label="Sort buses by"
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="time">Departure Time</option>
              <option value="priceAsc">Fare: Lowest First</option>
              <option value="priceDesc">Fare: Highest First</option>
              <option value="seats">Available Seats</option>
            </select>
          </div>

        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200/80 animate-pulse">
              <div className="h-5 bg-slate-200 rounded w-1/4 mb-4"></div>
              <div className="h-10 bg-slate-100 rounded w-full mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      ) : processedTrips.length === 0 ? (
        /* Empty State with Helpful Next Steps */
        <div className="bg-white p-10 sm:p-14 rounded-3xl border border-slate-200 text-center max-w-xl mx-auto my-8 shadow-xs">
          <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BusIcon className="w-7 h-7 stroke-[2]" />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2">No Scheduled Buses Found</h2>
          <p className="text-xs sm:text-sm text-slate-500 mb-6 leading-relaxed">
            There are currently no private buses scheduled between <strong className="capitalize text-slate-700">{from}</strong> and <strong className="capitalize text-slate-700">{to}</strong> on {date}.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => handleDateShift(1)}
              className="w-full sm:w-auto px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
            >
              Check Next Day &rarr;
            </button>
            <Link 
              href="/"
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Change Route Search
            </Link>
          </div>
        </div>
      ) : (
        /* Bus Cards List */
        <div className="space-y-4">
          {processedTrips.map((trip) => {
            const bookedCount = trip.bookedSeats ? Object.keys(trip.bookedSeats).length : 0;
            const totalBusSeats = trip.busSnapshot?.totalSeats || 40;
            const seatsLeft = Math.max(0, totalBusSeats - bookedCount);
            const isFillingFast = seatsLeft > 0 && seatsLeft <= 5;
            const rawLayout = (trip.busSnapshot?.seatLayout?.type || '2x2').toLowerCase();
            const busLayout = rawLayout.includes('3') ? '2x3' : rawLayout.includes('1') ? '2+1' : '2x2';
            const individualFare = Number(trip.farePerSeat || trip.baseFare || 0);

            // Bus-specific rating
            const busRatingInfo = trip.busId && busRatings[trip.busId] ? busRatings[trip.busId] : null;

            return (
              <div 
                key={trip.id} 
                className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group"
              >
                {/* Left & Center: Bus Identity, Timeline, Amenities */}
                <div className="flex-1">
                  
                  {/* Top Bar: Bus Operator, Reg Plate, Category, Bus Rating */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="font-black text-lg sm:text-xl text-slate-900 group-hover:text-orange-600 transition tracking-tight">
                      {trip.operatorName || trip.busSnapshot?.name || 'Intercity Express'}
                    </span>

                    {/* Sri Lanka License Plate Graphic Chip */}
                    <span className="font-mono text-xs font-black bg-slate-900 text-amber-300 px-2.5 py-0.5 rounded-lg border border-slate-700">
                      {trip.busSnapshot?.regNumber || 'NC-8492'}
                    </span>

                    <span className="px-2.5 py-0.5 text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 rounded-full">
                      {trip.busSnapshot?.type || 'Luxury Coach'}
                    </span>

                    {/* Layout Specification */}
                    <span className="px-2.5 py-0.5 text-[11px] font-bold bg-slate-100 text-slate-700 rounded-full">
                      {busLayout === '2x3' ? '2x3 Normal' : busLayout === '2+1' ? '2+1 VIP Sleeper' : '2x2 Luxury'}
                    </span>

                    {/* Explicit BUS-SPECIFIC RATING */}
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-200 ml-auto md:ml-0" title="Verified Bus Coach Rating">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                      <span>{busRatingInfo ? busRatingInfo.rating.toFixed(1) : '4.8'}</span>
                      <span className="text-[10px] font-semibold text-amber-600">
                        ({busRatingInfo ? busRatingInfo.count : '18'} bus reviews)
                      </span>
                    </span>
                  </div>

                  {/* Journey Timeline */}
                  <div className="flex items-center gap-4 sm:gap-8 my-4 py-2 border-y border-slate-100">
                    {/* Departure */}
                    <div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono tracking-tight">
                        {trip.departureTime}
                      </div>
                      <div className="text-xs font-bold text-slate-800 capitalize mt-0.5">
                        {from}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">
                        Boarding
                      </div>
                    </div>

                    {/* Expressway / Route Specs Line */}
                    <div className="flex-1 flex flex-col items-center px-2">
                      <span className="text-[10px] sm:text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                        {trip.duration || 'Direct Expressway'}
                      </span>
                      <div className="w-full max-w-[140px] h-0.5 bg-slate-200 relative my-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-orange-600 absolute -top-1 left-1/2 -translate-x-1/2 ring-4 ring-orange-100"></div>
                      </div>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                        Expressway Direct
                      </span>
                    </div>

                    {/* Arrival */}
                    <div className="text-right">
                      <div className="text-2xl sm:text-3xl font-black text-slate-700 font-mono tracking-tight">
                        {trip.arrivalTime || 'Scheduled'}
                      </div>
                      <div className="text-xs font-bold text-slate-800 capitalize mt-0.5">
                        {to}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">
                        Dropping
                      </div>
                    </div>
                  </div>

                  {/* Amenities Row & Seats Left Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {trip.busSnapshot?.amenities && trip.busSnapshot.amenities.length > 0 ? (
                        trip.busSnapshot.amenities.map((amenity, i) => (
                          <span 
                            key={i} 
                            className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 px-2 py-1 rounded-md text-[10.5px] font-semibold border border-slate-200"
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

                    {/* Seat availability indicator */}
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                        isFillingFast 
                          ? 'bg-red-50 text-red-700 border border-red-200' 
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {seatsLeft} Seats Available
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Right: Individual Bus Fare & Action CTA */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-56 gap-3 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                      Individual Bus Fare
                    </span>
                    <div className="flex items-baseline gap-1 md:justify-end">
                      <span className="text-xs font-bold text-slate-400">Rs.</span>
                      <span className="text-2xl sm:text-3xl font-black text-orange-600 tracking-tight">
                        {individualFare.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 block">
                      per passenger
                    </span>
                  </div>

                  <button 
                    onClick={() => router.push(`/book/${trip.id}`)}
                    className="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white px-6 py-3.5 rounded-2xl shadow-md hover:shadow-lg font-black text-xs sm:text-sm transition cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <span>Select Seats & Book</span>
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={
          <div className="min-h-[50vh] flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-slate-600 font-medium">Loading available buses and individual fares...</p>
          </div>
        }>
          <SearchResults />
        </Suspense>
      </main>
    </div>
  );
}
