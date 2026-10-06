"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

interface Props {
  value: string; // "HH:MM" in 24h format
  onChange: (val: string) => void;
  required?: boolean;
}

export default function DigitalTimePicker({ value, onChange, required }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Helper to parse 24h into 12h representation
  const parse24h = useCallback((val: string) => {
    let h = 12;
    let m = 0;
    let ap = 'AM';
    if (val) {
      const [hStr, mStr] = val.split(':');
      const parsedH = parseInt(hStr, 10);
      const parsedM = parseInt(mStr, 10);
      if (!isNaN(parsedH)) {
        if (parsedH >= 12) {
          ap = 'PM';
          h = parsedH > 12 ? parsedH - 12 : 12;
        } else {
          ap = 'AM';
          h = parsedH === 0 ? 12 : parsedH;
        }
      }
      if (!isNaN(parsedM)) m = parsedM;
    }
    return { h, m, ap };
  }, []);

  const initial = parse24h(value);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.m);
  const [ampm, setAmPm] = useState(initial.ap);
  const [textValue, setTextValue] = useState(
    `${initial.h.toString().padStart(2, '0')}:${initial.m.toString().padStart(2, '0')} ${initial.ap}`
  );

  // Update parent and local text when hour/minute/ampm changes via controls
  const updateTime = (newH: number, newM: number, newAp: string) => {
    setHour(newH);
    setMinute(newM);
    setAmPm(newAp);

    let h24 = newH;
    if (newAp === 'PM' && newH !== 12) h24 += 12;
    if (newAp === 'AM' && newH === 12) h24 = 0;

    const hh = h24.toString().padStart(2, '0');
    const mm = newM.toString().padStart(2, '0');
    const val = `${hh}:${mm}`;

    setTextValue(`${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')} ${newAp}`);
    onChange(val);
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

  const adjustHour = (delta: number) => {
    let newH = hour + delta;
    if (newH > 12) newH = 1;
    if (newH < 1) newH = 12;
    updateTime(newH, minute, ampm);
  };

  const adjustMinute = (delta: number) => {
    let newM = minute + delta;
    if (newM > 59) newM = 0;
    if (newM < 0) newM = 59;
    updateTime(hour, newM, ampm);
  };

  const toggleAmPm = () => {
    const newAp = ampm === 'AM' ? 'PM' : 'AM';
    updateTime(hour, minute, newAp);
  };
  
  const parseAndApplyText = () => {
    if (!textValue.trim()) return;
    
    const match = textValue.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const m = match[2] ? parseInt(match[2], 10) : 0;
      let ap = match[3] ? match[3].toUpperCase() : ampm;
      
      if (h > 24) h = 24;
      
      if (h > 12 && h < 24) {
        h -= 12;
        ap = 'PM';
      } else if (h === 24 || h === 0) {
        h = 12;
        ap = 'AM';
      } else if (h === 12 && !match[3]) {
        ap = 'PM';
      }

      updateTime(h, m, ap);
    } else {
      setTextValue(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${ampm}`);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input 
        type="text" 
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={parseAndApplyText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            parseAndApplyText();
            setShowDropdown(false);
          }
        }}
        placeholder="12:00 AM"
        required={required}
        className="p-2 border border-slate-300 rounded-xl w-full bg-white outline-none focus:border-orange-500 font-mono text-center text-lg shadow-xs"
      />
      
      {showDropdown && (
        <div className="absolute top-full left-0 mt-2 p-4 bg-white rounded-2xl shadow-2xl z-50 flex items-center gap-4 select-none border border-slate-200">
          {/* Hours */}
          <div className="flex flex-col items-center">
            <button type="button" onClick={() => adjustHour(1)} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▲</button>
            <div className="bg-slate-50 text-slate-800 font-mono text-3xl font-bold p-2.5 rounded-xl border border-slate-200 shadow-inner min-w-[60px] text-center">
              {hour.toString().padStart(2, '0')}
            </div>
            <button type="button" onClick={() => adjustHour(-1)} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▼</button>
          </div>

          <div className="text-slate-300 text-3xl font-mono pb-6">:</div>

          {/* Minutes */}
          <div className="flex flex-col items-center">
            <button type="button" onClick={() => adjustMinute(1)} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▲</button>
            <div className="bg-slate-50 text-slate-800 font-mono text-3xl font-bold p-2.5 rounded-xl border border-slate-200 shadow-inner min-w-[60px] text-center">
              {minute.toString().padStart(2, '0')}
            </div>
            <button type="button" onClick={() => adjustMinute(-1)} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▼</button>
          </div>

          {/* AM/PM */}
          <div className="flex flex-col items-center ml-2">
            <button type="button" onClick={toggleAmPm} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▲</button>
            <div 
              onClick={toggleAmPm}
              className="bg-orange-50 text-orange-600 font-black text-lg p-2.5 rounded-xl border border-orange-200 cursor-pointer min-w-[55px] text-center shadow-inner hover:bg-orange-100 transition-colors"
            >
              {ampm}
            </div>
            <button type="button" onClick={toggleAmPm} className="text-slate-400 hover:text-orange-500 p-1.5 cursor-pointer">▼</button>
          </div>
        </div>
      )}
    </div>
  );
}