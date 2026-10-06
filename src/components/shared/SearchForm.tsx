"use client";

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { MapPin, Navigation, Calendar, ArrowLeftRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BusStand } from '@/types/location';
import { searchBusStands, MAJOR_TRANSPORT_HUBS } from '@/data/sriLankaBusStands';

export default function SearchForm() {
  const router = useRouter();
  const t = useTranslations('search');
  
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  
  // Format today's date for min attribute (YYYY-MM-DD)
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(today);

  const [fromSuggestions, setFromSuggestions] = useState<BusStand[]>([]);
  const [toSuggestions, setToSuggestions] = useState<BusStand[]>([]);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    const cleanFrom = from.trim();
    const cleanTo = to.trim();

    if (!cleanFrom) {
      setValidationError("Please select an origin city.");
      return;
    }
    if (!cleanTo) {
      setValidationError("Please select a destination city.");
      return;
    }
    if (cleanFrom.toLowerCase() === cleanTo.toLowerCase()) {
      setValidationError("Origin and destination cities cannot be the same.");
      return;
    }
    if (!date) {
      setValidationError("Please select a travel date.");
      return;
    }

    router.push(`/search?from=${encodeURIComponent(cleanFrom.toLowerCase())}&to=${encodeURIComponent(cleanTo.toLowerCase())}&date=${encodeURIComponent(date)}`);
  };

  const handleSwap = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
    setShowFrom(false);
    setShowTo(false);
  };

  const handleFromChange = (val: string) => {
    setFrom(val);
    if (val.trim().length > 0) {
      setFromSuggestions(searchBusStands(val, 12));
      setShowFrom(true);
    } else {
      setFromSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
      setShowFrom(true);
    }
  };

  const handleToChange = (val: string) => {
    setTo(val);
    if (val.trim().length > 0) {
      setToSuggestions(searchBusStands(val, 12));
      setShowTo(true);
    } else {
      setToSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
      setShowTo(true);
    }
  };

  return (
    <div className="w-full">
      {validationError && (
        <div className="max-w-4xl mx-auto mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-semibold text-center">
          {validationError}
        </div>
      )}

      <form 
        onSubmit={handleSearch} 
        className="flex flex-col md:flex-row items-center w-full max-w-5xl mx-auto bg-white p-3 rounded-2xl shadow-xl border border-slate-200/80 relative"
      >
        {/* From Field */}
        <div className="flex-1 flex flex-col px-4 py-2 w-full md:w-auto relative group">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-orange-500" />
            <span>{t('from')}</span>
          </label>
          <input 
            type="text" 
            required 
            placeholder="e.g. Colombo, Jaffna"
            className="w-full outline-none text-slate-800 text-base font-bold bg-transparent placeholder-slate-300"
            value={from} 
            onChange={e => handleFromChange(e.target.value)}
            onFocus={() => {
              if (!from) setFromSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
              setShowFrom(true);
            }}
            onBlur={() => setTimeout(() => setShowFrom(false), 250)}
          />
          {showFrom && fromSuggestions.length > 0 && (
            <ul className="absolute top-full left-0 w-full md:w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-50 max-h-64 overflow-y-auto text-left py-1 divide-y divide-slate-100">
              {fromSuggestions.map(stand => (
                <li 
                  key={stand.id} 
                  className="px-3.5 py-2.5 hover:bg-orange-50 cursor-pointer text-slate-800 transition flex items-start justify-between gap-2"
                  onMouseDown={() => { setFrom(stand.name); setShowFrom(false); }}
                >
                  <div className="flex items-start gap-2">
                    <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${stand.isMajorHub ? 'text-amber-500' : 'text-orange-400'}`} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>{stand.name}</span>
                        {stand.isMajorHub && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">Hub</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {stand.district} &bull; {stand.province}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Swap Direction Button */}
        <div className="my-1 md:my-0 flex items-center justify-center">
          <button
            type="button"
            onClick={handleSwap}
            title={t('swap')}
            className="p-2.5 rounded-full bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-orange-600 border border-slate-200 transition active:rotate-180 duration-300 cursor-pointer shadow-xs"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
        </div>

        {/* To Field */}
        <div className="flex-1 flex flex-col px-4 py-2 w-full md:w-auto relative group border-t md:border-t-0 border-slate-100">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5 text-orange-500" />
            <span>{t('to')}</span>
          </label>
          <input 
            type="text" 
            required 
            placeholder="e.g. Kandy, Batticaloa"
            className="w-full outline-none text-slate-800 text-base font-bold bg-transparent placeholder-slate-300"
            value={to} 
            onChange={e => handleToChange(e.target.value)}
            onFocus={() => {
              if (!to) setToSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
              setShowTo(true);
            }}
            onBlur={() => setTimeout(() => setShowTo(false), 250)}
          />
          {showTo && toSuggestions.length > 0 && (
            <ul className="absolute top-full left-0 w-full md:w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-50 max-h-64 overflow-y-auto text-left py-1 divide-y divide-slate-100">
              {toSuggestions.map(stand => (
                <li 
                  key={stand.id} 
                  className="px-3.5 py-2.5 hover:bg-orange-50 cursor-pointer text-slate-800 transition flex items-start justify-between gap-2"
                  onMouseDown={() => { setTo(stand.name); setShowTo(false); }}
                >
                  <div className="flex items-start gap-2">
                    <Navigation className={`w-4 h-4 mt-0.5 shrink-0 ${stand.isMajorHub ? 'text-amber-500' : 'text-orange-400'}`} />
                    <div>
                      <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                        <span>{stand.name}</span>
                        {stand.isMajorHub && (
                          <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded">Hub</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {stand.district} &bull; {stand.province}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="hidden md:block w-px h-10 bg-slate-200 mx-2"></div>

        {/* Date Field */}
        <div className="flex-1 flex flex-col px-4 py-2 w-full md:w-auto relative group border-t md:border-t-0 border-slate-100">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-orange-500" />
            <span>{t('date')}</span>
          </label>
          <input 
            type="date" 
            required 
            min={today}
            className="w-full outline-none text-slate-800 text-base font-bold bg-transparent cursor-pointer"
            value={date} 
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* Search Submit Button */}
        <button 
          type="submit" 
          className="w-full md:w-auto bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 px-8 rounded-xl transition-all shadow-md hover:shadow-lg mt-3 md:mt-0 md:ml-2 text-base flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Search className="w-5 h-5" />
          <span>{t('searchBuses')}</span>
        </button>
      </form>
    </div>
  );
}