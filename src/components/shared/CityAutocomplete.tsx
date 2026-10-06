"use client";

import { useState, useRef, useEffect } from 'react';
import { BusStand } from '@/types/location';
import { searchBusStands, MAJOR_TRANSPORT_HUBS } from '@/data/sriLankaBusStands';
import { MapPin, Sparkles } from 'lucide-react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onSelectStand?: (stand: BusStand) => void;
}

export default function CityAutocomplete({ 
  value, 
  onChange, 
  placeholder, 
  required, 
  className,
  onSelectStand
}: Props) {
  const [suggestions, setSuggestions] = useState<BusStand[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleInput = (val: string) => {
    onChange(val);
    setHighlightedIndex(-1);
    if (!val.trim()) {
      setSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 10));
      setShowDropdown(true);
      return;
    }
    const matches = searchBusStands(val, 15);
    setSuggestions(matches);
    setShowDropdown(true);
  };

  const handleSelect = (stand: BusStand) => {
    onChange(stand.name);
    if (onSelectStand) onSelectStand(stand);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input 
        type="text" 
        value={value}
        onChange={e => handleInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value) handleInput(value);
          else {
            setSuggestions(MAJOR_TRANSPORT_HUBS.slice(0, 10));
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className || "w-full p-2.5 border border-slate-300 rounded-xl outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition-all text-sm font-medium text-slate-800"}
      />

      {showDropdown && suggestions.length > 0 && (
        <ul className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl mt-1.5 z-50 max-h-72 overflow-y-auto divide-y divide-slate-100 text-left">
          {!value.trim() && (
            <li className="px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200">
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              Major Sri Lankan Transit Terminals & Hubs
            </li>
          )}
          {suggestions.map((stand, idx) => (
            <li 
              key={stand.id} 
              onMouseDown={(e) => {
                e.preventDefault(); // prevents premature blur
                handleSelect(stand);
              }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`p-3 cursor-pointer transition-colors flex items-center justify-between gap-2 ${
                idx === highlightedIndex ? 'bg-orange-50/80 text-orange-950' : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className={`mt-0.5 p-1 rounded-lg ${stand.isMajorHub ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm text-slate-900">{stand.name}</span>
                    {stand.isMajorHub && (
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
                        Major Hub
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <span>{stand.district} District</span>
                    <span>&bull;</span>
                    <span className="text-slate-400">{stand.province}</span>
                  </div>
                  {stand.aliases && stand.aliases.length > 0 && (
                    <div className="text-[10.5px] text-slate-400 italic mt-0.5">
                      aka: {stand.aliases.slice(0, 3).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}