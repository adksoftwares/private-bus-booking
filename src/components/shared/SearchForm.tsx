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
  
  // Format today's and tomorrow's date for quick date chips (YYYY-MM-DD)
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const [date, setDate] = useState(todayStr);

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
      setValidationError("Please select an origin departure city.");
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
      setValidationError("Please select your travel date.");
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
        <div className="max-w-4xl mx-auto mb-3 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-bold text-center animate-fade-in-up">
          {validationError}
        </div>
      )}

      <form 
        onSubmit={handleSearch} 
        className="w-full max-w-5xl mx-auto bg-white p-2.5 sm:p-3.5 rounded-3xl shadow-xl border border-slate-200/90 relative"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          
          {/* Origin (From) Field */}
          <div className="flex-1 bg-slate-50/80 hover:bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 border border-slate-200/80 rounded-2xl p-3 relative transition-all">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-orange-600" />
              <span>{t('from')}</span>
            </label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Colombo (Bastian Mwt)"
              className="w-full outline-none text-slate-900 text-sm sm:text-base font-black bg-transparent placeholder-slate-400"
              value={from} 
              onChange={e => handleFromChange(e.target.value)}
              onFocus={() => {
                if (!from) setFromSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
                setShowFrom(true);
              }}
              onBlur={() => setTimeout(() => setShowFrom(false), 250)}
            />
            
            {/* Auto-suggest dropdown */}
            {showFrom && fromSuggestions.length > 0 && (
              <ul className="absolute top-full left-0 w-full sm:w-88 bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-50 max-h-72 overflow-y-auto text-left py-1 divide-y divide-slate-100">
                <li className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  Select Origin Station / Stand
                </li>
                {fromSuggestions.map(stand => (
                  <li 
                    key={stand.id} 
                    className="px-3.5 py-2.5 hover:bg-orange-50 cursor-pointer text-slate-800 transition flex items-start justify-between gap-2"
                    onMouseDown={() => { setFrom(stand.name); setShowFrom(false); }}
                  >
                    <div className="flex items-start gap-2.5">
                      <MapPin className={`w-4 h-4 mt-0.5 shrink-0 ${stand.isMajorHub ? 'text-orange-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{stand.name}</span>
                          {stand.isMajorHub && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-orange-100 text-orange-800 rounded">
                              Major Hub
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {stand.district} &bull; {stand.province}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Swap Origin/Destination Button */}
          <div className="flex items-center justify-center -my-2 md:my-0 md:-mx-2 z-10">
            <button
              type="button"
              onClick={handleSwap}
              title={t('swap')}
              className="w-9 h-9 rounded-full bg-white hover:bg-orange-50 text-slate-600 hover:text-orange-600 border border-slate-300 shadow-sm transition-all duration-200 hover:scale-105 active:rotate-180 cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Swap departure and arrival locations"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Destination (To) Field */}
          <div className="flex-1 bg-slate-50/80 hover:bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 border border-slate-200/80 rounded-2xl p-3 relative transition-all">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-orange-600" />
              <span>{t('to')}</span>
            </label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Kandy, Jaffna, Galle"
              className="w-full outline-none text-slate-900 text-sm sm:text-base font-black bg-transparent placeholder-slate-400"
              value={to} 
              onChange={e => handleToChange(e.target.value)}
              onFocus={() => {
                if (!to) setToSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
                setShowTo(true);
              }}
              onBlur={() => setTimeout(() => setShowTo(false), 250)}
            />

            {/* Auto-suggest dropdown */}
            {showTo && toSuggestions.length > 0 && (
              <ul className="absolute top-full left-0 w-full sm:w-88 bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-50 max-h-72 overflow-y-auto text-left py-1 divide-y divide-slate-100">
                <li className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  Select Destination Station / Stand
                </li>
                {toSuggestions.map(stand => (
                  <li 
                    key={stand.id} 
                    className="px-3.5 py-2.5 hover:bg-orange-50 cursor-pointer text-slate-800 transition flex items-start justify-between gap-2"
                    onMouseDown={() => { setTo(stand.name); setShowTo(false); }}
                  >
                    <div className="flex items-start gap-2.5">
                      <Navigation className={`w-4 h-4 mt-0.5 shrink-0 ${stand.isMajorHub ? 'text-orange-600' : 'text-slate-400'}`} />
                      <div>
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{stand.name}</span>
                          {stand.isMajorHub && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 bg-orange-100 text-orange-800 rounded">
                              Major Hub
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium">
                          {stand.district} &bull; {stand.province}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Travel Date Field + Quick Date Chips */}
          <div className="flex-1 bg-slate-50/80 hover:bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 border border-slate-200/80 rounded-2xl p-3 transition-all">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-600" />
                <span>{t('date')}</span>
              </label>
              {/* Quick Date Chips */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDate(todayStr)}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${date === todayStr ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDate(tomorrowStr)}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${date === tomorrowStr ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Tomorrow
                </button>
              </div>
            </div>
            <input 
              type="date" 
              required 
              min={todayStr}
              className="w-full outline-none text-slate-900 text-sm sm:text-base font-black bg-transparent cursor-pointer"
              value={date} 
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* Primary Search CTA Button */}
          <button 
            type="submit" 
            className="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black py-4 px-8 rounded-2xl transition-all shadow-md hover:shadow-lg text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer shrink-0"
          >
            <Search className="w-5 h-5 stroke-[2.5]" />
            <span>{t('searchBuses')}</span>
          </button>

        </div>
      </form>
    </div>
  );
}