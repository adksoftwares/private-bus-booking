"use client";

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from '@/i18n/routing';
import { MapPin, Navigation, Calendar, ArrowLeftRight, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { BusStand } from '@/types/location';
import { searchBusStands, MAJOR_TRANSPORT_HUBS } from '@/data/sriLankaBusStands';


const subscribeToNoChanges = () => () => {};
const getServerDateSnapshot = () => '';
const getLocalDateString = (daysFromToday: number) => {
  const value = new Date();
  value.setDate(value.getDate() + daysFromToday);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

export default function SearchForm() {
  const router = useRouter();
  const t = useTranslations('search');
  
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  
  // Hydration-safe local dates: the server snapshot is empty; the browser supplies local calendar dates.
  const todayStr = useSyncExternalStore(subscribeToNoChanges, () => getLocalDateString(0), getServerDateSnapshot);
  const tomorrowStr = useSyncExternalStore(subscribeToNoChanges, () => getLocalDateString(1), getServerDateSnapshot);

  const [date, setDate] = useState('');

  const [fromSuggestions, setFromSuggestions] = useState<BusStand[]>([]);
  const [toSuggestions, setToSuggestions] = useState<BusStand[]>([]);
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [highlightedFromIndex, setHighlightedFromIndex] = useState(-1);
  const [highlightedToIndex, setHighlightedToIndex] = useState(-1);
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
    const travelDate = date || todayStr;
    if (!travelDate) {
      setValidationError("Please select your travel date.");
      return;
    }

    router.push(`/search?from=${encodeURIComponent(cleanFrom.toLowerCase())}&to=${encodeURIComponent(cleanTo.toLowerCase())}&date=${encodeURIComponent(travelDate)}`);
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
    setHighlightedFromIndex(-1);
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
    setHighlightedToIndex(-1);
    if (val.trim().length > 0) {
      setToSuggestions(searchBusStands(val, 12));
      setShowTo(true);
    } else {
      setToSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 8));
      setShowTo(true);
    }
  };

  const handleLocationKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, field: 'from' | 'to') => {
    const suggestions = field === 'from' ? fromSuggestions : toSuggestions;
    const isOpen = field === 'from' ? showFrom : showTo;
    const index = field === 'from' ? highlightedFromIndex : highlightedToIndex;
    const setIndex = field === 'from' ? setHighlightedFromIndex : setHighlightedToIndex;
    if (event.key === 'Escape') {
      if (isOpen) { event.preventDefault(); if (field === 'from') setShowFrom(false); else setShowTo(false); }
      return;
    }
    if (!isOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault(); setIndex(current => current >= suggestions.length - 1 ? 0 : current + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault(); setIndex(current => current <= 0 ? suggestions.length - 1 : current - 1);
    } else if (event.key === 'Enter' && index >= 0) {
      event.preventDefault();
      const selected = suggestions[index];
      if (field === 'from') { setFrom(selected.name); setShowFrom(false); }
      else { setTo(selected.name); setShowTo(false); }
      setIndex(-1);
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
        className="w-full max-w-5xl mx-auto bg-white p-2 sm:p-3 rounded-2xl sm:rounded-3xl shadow-[0_8px_28px_rgba(18,31,43,0.09)] border border-slate-200 relative"
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2">
          
          {/* Origin (From) Field */}
          <div className="flex-1 bg-slate-50/80 hover:bg-white focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-300 border border-slate-200/80 rounded-2xl p-3 relative transition-all">
            <label htmlFor="search-origin" className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-orange-600" />
              <span>{t('from')}</span>
            </label>
            <input 
              id="search-origin"
              type="text" 
              onKeyDown={e => handleLocationKeyDown(e, 'from')}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showFrom && fromSuggestions.length > 0}
              aria-controls="search-origin-options"
              aria-activedescendant={highlightedFromIndex >= 0 ? `search-origin-option-${fromSuggestions[highlightedFromIndex]?.id}` : undefined}
              autoComplete="off"
              required 
              placeholder="e.g. Colombo (Bastian Mwt)"
              className="w-full min-h-8 outline-none text-slate-900 text-base sm:text-base font-semibold bg-transparent placeholder-slate-400"
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
              <ul id="search-origin-options" role="listbox" className="absolute top-full left-0 w-full sm:w-88 bg-white border border-slate-200 rounded-xl sm:rounded-2xl shadow-xl mt-2 z-50 max-h-72 overflow-y-auto text-left py-1 divide-y divide-slate-100">
                <li aria-hidden="true" className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  Select Origin Station / Stand
                </li>
                {fromSuggestions.map(stand => (
                  <li 
                    key={stand.id}
                    id={`search-origin-option-${stand.id}`}
                    role="option"
                    aria-selected={highlightedFromIndex === fromSuggestions.findIndex(item => item.id === stand.id)}
                    className={`px-3.5 py-3 min-h-12 cursor-pointer text-slate-800 transition-colors flex items-start justify-between gap-2 ${highlightedFromIndex === fromSuggestions.findIndex(item => item.id === stand.id) ? 'bg-orange-50' : 'hover:bg-orange-50'}`}
                    onMouseDown={() => { setFrom(stand.name); setShowFrom(false); setHighlightedFromIndex(-1); }}
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
              className="w-11 h-11 rounded-full bg-white hover:bg-orange-50 text-slate-600 hover:text-orange-600 border border-slate-300 shadow-sm transition-colors active:rotate-180 cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label="Swap departure and arrival locations"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* Destination (To) Field */}
          <div className="flex-1 bg-slate-50/80 hover:bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 border border-slate-200/80 rounded-2xl p-3 relative transition-all">
            <label htmlFor="search-destination" className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-orange-600" />
              <span>{t('to')}</span>
            </label>
            <input 
              id="search-destination"
              type="text" 
              onKeyDown={e => handleLocationKeyDown(e, 'to')}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showTo && toSuggestions.length > 0}
              aria-controls="search-destination-options"
              aria-activedescendant={highlightedToIndex >= 0 ? `search-destination-option-${toSuggestions[highlightedToIndex]?.id}` : undefined}
              autoComplete="off"
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
              <ul id="search-destination-options" role="listbox" className="absolute top-full left-0 w-full sm:w-88 bg-white border border-slate-200 rounded-2xl shadow-2xl mt-2 z-50 max-h-72 overflow-y-auto text-left py-1 divide-y divide-slate-100">
                <li aria-hidden="true" className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50">
                  Select Destination Station / Stand
                </li>
                {toSuggestions.map(stand => (
                  <li 
                    key={stand.id}
                    id={`search-destination-option-${stand.id}`}
                    role="option"
                    aria-selected={highlightedToIndex === toSuggestions.findIndex(item => item.id === stand.id)}
                    className={`px-3.5 py-3 min-h-12 cursor-pointer text-slate-800 transition-colors flex items-start justify-between gap-2 ${highlightedToIndex === toSuggestions.findIndex(item => item.id === stand.id) ? 'bg-orange-50' : 'hover:bg-orange-50'}`}
                    onMouseDown={() => { setTo(stand.name); setShowTo(false); setHighlightedToIndex(-1); }}
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
          <div className="flex-1 bg-slate-50/80 hover:bg-white focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-500/20 focus-within:border-orange-300 border border-slate-200/80 rounded-2xl p-3 transition-all">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="search-travel-date" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-600" />
                <span>{t('date')}</span>
              </label>
              {/* Quick Date Chips */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDate(todayStr)}
                  disabled={!todayStr}
                  aria-pressed={(date || todayStr) === todayStr}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${(date || todayStr) === todayStr ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setDate(tomorrowStr)}
                  disabled={!tomorrowStr}
                  aria-pressed={date === tomorrowStr}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded cursor-pointer transition ${(date || todayStr) === tomorrowStr ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Tomorrow
                </button>
              </div>
            </div>
            <input 
              type="date" 
              required 
              min={todayStr}
              id="search-travel-date"
              className="w-full min-h-8 outline-none text-slate-900 text-base sm:text-base font-semibold bg-transparent cursor-pointer"
              value={date || todayStr} 
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* Primary Search CTA Button */}
          <button 
            type="submit" 
            className="min-h-12 bg-orange-600 hover:bg-orange-700 active:scale-[0.99] text-white font-semibold py-3.5 px-6 sm:px-8 rounded-xl sm:rounded-2xl transition-colors shadow-sm hover:shadow-md text-sm sm:text-base flex items-center justify-center gap-2.5 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            <Search className="w-5 h-5 stroke-[2.5]" />
            <span>{t('searchBuses')}</span>
          </button>

        </div>
      </form>
    </div>
  );
}