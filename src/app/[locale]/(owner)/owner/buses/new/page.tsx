"use client";

import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ref, update } from 'firebase/database';
import { db } from '@/lib/firebase';
import { Bus } from '@/types/bus';
import { 
  ArrowLeft, 
  Bus as BusIcon, 
  Check, 
  ShieldCheck, 
  Sparkles, 
  Snowflake, 
  Wifi, 
  Zap, 
  Tv, 
  Briefcase, 
  Crown, 
  Armchair,
  Users
} from 'lucide-react';

const SRI_LANKAN_PROVINCES = [
  { code: 'WP', name: 'Western (WP)' },
  { code: 'EP', name: 'Eastern (EP)' },
  { code: 'NP', name: 'Northern (NP)' },
  { code: 'CP', name: 'Central (CP)' },
  { code: 'SP', name: 'Southern (SP)' },
  { code: 'NW', name: 'North Western (NW)' },
  { code: 'NC', name: 'North Central (NC)' },
  { code: 'UP', name: 'Uva (UP)' },
  { code: 'SG', name: 'Sabaragamuwa (SG)' }
];

const COMMON_AMENITIES = [
  { id: 'AC', label: 'Air Conditioning (AC)', icon: Snowflake },
  { id: 'Wi-Fi', label: 'High-Speed Wi-Fi', icon: Wifi },
  { id: 'Charging', label: 'USB Charging Ports', icon: Zap },
  { id: 'Reclining', label: 'Reclining Seats', icon: Sparkles },
  { id: 'TV/Audio', label: 'Audio / TV Entertainment', icon: Tv },
  { id: 'Luggage', label: 'Large Luggage Compartment', icon: Briefcase }
];

const BUS_TYPES = [
  'Super Luxury AC',
  'Highway Express',
  'Semi Luxury',
  'Normal (SLTB / Private)'
];

type LayoutType = '2x2' | '2x3' | '2+1';
type BackRowType = '5-seater' | '4-seater';

export default function NewBusPage() {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations('fleet');

  const [name, setName] = useState('');
  
  // Sri Lankan 3-Box Number Plate State (Province • Letters • Numbers)
  const [province, setProvince] = useState('WP');
  const [plateLetters, setPlateLetters] = useState('');
  const [plateNumbers, setPlateNumbers] = useState('');
  const [isCustomPlate, setIsCustomPlate] = useState(false);
  const [customRegNumber, setCustomRegNumber] = useState('');
  const numbersInputRef = useRef<HTMLInputElement>(null);

  const [type, setType] = useState('Super Luxury AC');
  const [layoutType, setLayoutType] = useState<LayoutType>('2x2');
  const [backRowType, setBackRowType] = useState<BackRowType>('5-seater');
  const [totalSeats, setTotalSeats] = useState(45);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([
    'Air Conditioning (AC)',
    'USB Charging Ports',
    'Reclining Seats'
  ]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Handle letter series change with auto-focus to numbers box
  const handleLettersChange = (val: string) => {
    const clean = val.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    setPlateLetters(clean);
    if (clean.length >= 2) {
      numbersInputRef.current?.focus();
    }
  };

  const currentFormattedPlate = isCustomPlate
    ? (customRegNumber.trim().toUpperCase() || 'CUSTOM')
    : `${province} ${plateLetters || '••'}-${plateNumbers || '••••'}`;

  // Sri Lankan Grid Dimensions
  const cols = layoutType === '2x3' ? 5 : layoutType === '2+1' ? 3 : 4;
  const aisleCol = 2; // Always at index 2 (between 2 left seats and right seats)

  // Calculate rows based on layout and back row
  let rows = 10;
  if (layoutType === '2x3') {
    rows = Math.ceil(totalSeats / 5);
  } else if (layoutType === '2+1') {
    rows = Math.ceil(totalSeats / 3);
  } else {
    // 2x2
    if (backRowType === '5-seater') {
      rows = totalSeats <= 5 ? 1 : 1 + Math.ceil((totalSeats - 5) / 4);
    } else {
      rows = Math.ceil(totalSeats / 4);
    }
  }

  // Check if current seat capacity leaves an incomplete rear row in 2x2
  const isIncomplete2x2Bench = layoutType === '2x2' && backRowType === '5-seater' && totalSeats > 5 && ((totalSeats - 5) % 4 !== 0);
  const isIncomplete2x2 = isIncomplete2x2Bench || (layoutType === '2x2' && backRowType === '4-seater' && (totalSeats % 4 !== 0));
  const is55in2x2 = layoutType === '2x2' && (totalSeats === 55 || totalSeats === 54);

  const lowerFullSeats = layoutType === '2x2' && backRowType === '5-seater'
    ? 5 + Math.floor((totalSeats - 5) / 4) * 4
    : Math.floor(totalSeats / 4) * 4;
  const upperFullSeats = lowerFullSeats + 4;

  const handleLayoutChange = (newLayout: LayoutType) => {
    setLayoutType(newLayout);
    if (newLayout === '2x3') {
      setTotalSeats(totalSeats === 55 ? 55 : 54);
      setBackRowType('5-seater');
      if (type === 'Super Luxury AC') setType('Normal (SLTB / Private)');
    } else if (newLayout === '2+1') {
      setTotalSeats(28);
      setBackRowType('4-seater');
      if (type === 'Normal (SLTB / Private)' || type === 'Semi Luxury') setType('Super Luxury AC');
    } else {
      // 2x2
      setTotalSeats(45);
      setBackRowType('5-seater');
      if (type === 'Normal (SLTB / Private)') setType('Super Luxury AC');
    }
  };

  const handleSeatPresetSelect = (seats: number) => {
    setTotalSeats(seats);
    if (layoutType === '2x2') {
      if (seats % 4 === 1 || seats === 45 || seats === 49 || seats === 41 || seats === 53 || seats === 57) {
        setBackRowType('5-seater');
      } else {
        setBackRowType('4-seater');
      }
    }
  };

  const toggleAmenity = (label: string) => {
    setSelectedAmenities(prev => 
      prev.includes(label) ? prev.filter(a => a !== label) : [...prev, label]
    );
  };

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setErrorMsg("Please sign in to register a bus.");
      return;
    }

    if (!name.trim()) {
      setErrorMsg("Please enter the bus or operator name.");
      return;
    }

    const finalRegNumber = isCustomPlate
      ? customRegNumber.trim().toUpperCase()
      : (plateLetters.trim() && plateNumbers.trim()
          ? `${province} ${plateLetters.trim().toUpperCase()}-${plateNumbers.trim()}`
          : '');

    if (!finalRegNumber) {
      setErrorMsg(isCustomPlate
        ? "Please enter the vehicle registration number."
        : "Please complete the registration number: select Province, enter Letters (e.g. NB), and 4 digits (e.g. 4521).");
      return;
    }

    if (totalSeats < 10 || totalSeats > 75) {
      setErrorMsg("Seating capacity must be between 10 and 75 seats.");
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const busId = `BUS-${Date.now()}`;
      const now = Date.now();

      const busPayload: Bus = {
        id: busId,
        ownerId: user.uid,
        name: name.trim(),
        regNumber: finalRegNumber,
        type,
        totalSeats,
        seatLayout: {
          rows,
          cols,
          aisleCol,
          type: layoutType,
          totalSeats,
          backRowType: layoutType === '2x2' ? backRowType : (layoutType === '2x3' ? '5-seater' : 'with-aisle')
        },
        amenities: selectedAmenities,
        status: 'active',
        createdAt: now
      };

      const updates: Record<string, unknown> = {};
      updates[`buses/${busId}`] = busPayload;
      updates[`ownerBuses/${user.uid}/${busId}`] = true;

      // Ensure user role is active Owner in RTDB
      updates[`owners/${user.uid}/status`] = 'active';

      await update(ref(db), updates);
      router.push('/owner/buses');
    } catch (err: unknown) {
      console.error("Failed to register bus:", err);
      const errObj = err as Error;
      setErrorMsg(errObj.message || 'Failed to save bus to database. Please check your permissions.');
    } finally {
      setSaving(false);
    }
  };

  // Helper to render live visual seat map
  const renderPreviewGrid = () => {
    const previewRows = [];
    let seatCount = 1;
    const totalGridCols = layoutType === '2x3' ? 6 : layoutType === '2+1' ? 4 : 5;
    const is2x2Connected = layoutType === '2x2' && backRowType === '5-seater';

    for (let r = 0; r < rows; r++) {
      const isLastRow = r === rows - 1;
      const rowCols = [];

      for (let c = 0; c < totalGridCols; c++) {
        const isAisleCol = c === aisleCol;
        const isBackCenterSeat = isLastRow && is2x2Connected && isAisleCol && seatCount <= totalSeats;

        if (isAisleCol && !isBackCenterSeat) {
          // Walkway Aisle column
          rowCols.push(
            <div 
              key={`aisle-${r}`} 
              className={`${layoutType === '2x3' ? 'w-4' : layoutType === '2+1' ? 'w-6' : 'w-5'} flex items-center justify-center`}
            >
              {isLastRow && layoutType === '2x3' ? (
                <div className="w-full h-5 bg-slate-800 border border-slate-700 rounded flex items-center justify-center">
                  <span className="text-[6.5px] font-bold text-slate-400">BENCH</span>
                </div>
              ) : (
                <div className="h-full w-px border-r border-dashed border-slate-700"></div>
              )}
            </div>
          );
        } else {
          if (seatCount > totalSeats) {
            rowCols.push(
              <div 
                key={`empty-${r}-${c}`} 
                className={`${layoutType === '2x3' ? 'w-5 h-6' : layoutType === '2+1' ? 'w-7 h-6' : 'w-6 h-6'} opacity-0`} 
              />
            );
            continue;
          }

          const currentNum = seatCount;
          seatCount++;

          let seatCode = 'W';
          if (isBackCenterSeat) {
            seatCode = 'C';
          } else if (layoutType === '2x3') {
            if (c === 0 || c === 5) seatCode = 'W';
            else if (c === 1 || c === 3) seatCode = 'A';
            else if (c === 4) seatCode = 'M';
          } else if (layoutType === '2x2') {
            if (c === 0 || c === 4) seatCode = 'W';
            else if (c === 1 || c === 3) seatCode = 'A';
          } else if (layoutType === '2+1') {
            if (c === 0) seatCode = 'W';
            else if (c === 1) seatCode = 'A';
            else if (c === 3) seatCode = 'VIP';
          }

          rowCols.push(
            <div
              key={`seat-${currentNum}`}
              className={`${layoutType === '2x3' ? 'w-5.5 h-6 text-[8px]' : layoutType === '2+1' ? 'w-7 h-6 text-[9px]' : 'w-6 h-6 text-[8.5px]'} rounded bg-slate-800 border border-slate-700 flex flex-col items-center justify-center font-mono font-bold ${isBackCenterSeat ? 'border-amber-500/60 bg-amber-950/40 text-amber-300' : seatCode === 'VIP' ? 'border-purple-500/60 bg-purple-950/40 text-purple-300' : 'text-slate-200'}`}
              title={`Seat S${currentNum} (${seatCode})`}
            >
              <span className="leading-none">{currentNum}</span>
              <span className="text-[6px] text-slate-400 font-sans leading-none mt-0.5">{seatCode}</span>
            </div>
          );
        }
      }

      previewRows.push(
        <div key={`row-${r}`} className="flex items-center justify-between gap-1">
          {rowCols}
        </div>
      );
    }

    return previewRows;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Top Back Navigation */}
      <div className="mb-6">
        <Link 
          href="/owner/buses"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Fleet Overview</span>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Left: Input Form */}
        <div className="flex-1 bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/90 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center shadow-xs">
              <BusIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800">{t('addNewBus')}</h1>
              <p className="text-xs sm:text-sm text-slate-500">Configure authentic Sri Lankan bus seating and onboard amenities</p>
            </div>
          </div>

          {errorMsg && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold mb-6">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSaveBus} className="space-y-6">
            {/* Bus Name & Bus Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  {t('busName')} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('busNamePlaceholder')}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition font-medium bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  {t('busType')}
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition bg-white font-medium"
                >
                  {BUS_TYPES.map((bt) => (
                    <option key={bt} value={bt}>{bt}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sri Lanka Registration Number (3-Box Format: Province • Letters • Numbers) */}
            <div className="bg-slate-50/90 p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('regNumber')} *
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                  Sri Lankan Format
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Standard 3-box format: <strong className="text-slate-700">Province • Letters • 4-Digit Number</strong> (e.g. <span className="font-mono font-bold text-slate-800">EP NB-4521</span>)
              </p>

              {!isCustomPlate ? (
                <div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {/* Box 1: Province Dropdown */}
                    <div className="w-28 sm:w-36 shrink-0">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        1. {t('province')}
                      </label>
                      <select
                        value={province}
                        onChange={(e) => setProvince(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition shadow-2xs cursor-pointer"
                      >
                        {SRI_LANKAN_PROVINCES.map((p) => (
                          <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Box 2: Letters Input */}
                    <div className="w-20 sm:w-28 shrink-0">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        2. {t('letters')}
                      </label>
                      <input
                        type="text"
                        maxLength={3}
                        placeholder="NB"
                        value={plateLetters}
                        onChange={(e) => handleLettersChange(e.target.value)}
                        className="w-full px-3 py-3 rounded-xl border border-slate-200 text-sm font-mono font-bold text-center uppercase tracking-wider bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition shadow-2xs placeholder-slate-300"
                      />
                    </div>

                    {/* Hyphen Separator */}
                    <div className="pt-4 flex items-center justify-center">
                      <span className="text-2xl font-black text-slate-400 select-none">-</span>
                    </div>

                    {/* Box 3: 4-Digit Number Input */}
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        3. {t('numbers')} (4 Digits)
                      </label>
                      <input
                        ref={numbersInputRef}
                        type="text"
                        maxLength={4}
                        inputMode="numeric"
                        placeholder="4521"
                        value={plateNumbers}
                        onChange={(e) => setPlateNumbers(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono font-bold text-center tracking-widest bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition shadow-2xs placeholder-slate-300"
                      />
                    </div>
                  </div>

                  {/* License Plate Live Graphic Preview & Toggle */}
                  <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-slate-500">
                        {t('platePreview')}:
                      </span>
                      {/* Sri Lankan Commercial Vehicle License Plate: Yellow Background with Black Text */}
                      <div className="inline-flex items-center bg-amber-400 text-slate-950 border-2 border-slate-900 rounded-lg px-3 py-1 font-mono font-black text-sm tracking-widest shadow-xs select-none">
                        <span className="text-xs font-extrabold pr-2 mr-2 border-r-2 border-slate-900/40 text-slate-800">
                          {province}
                        </span>
                        <span>{plateLetters || '••'} - {plateNumbers || '••••'}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCustomPlate(true)}
                      className="text-xs text-orange-600 hover:text-orange-700 font-semibold underline cursor-pointer"
                    >
                      {t('customPlateToggle')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Custom / Vintage Single Box */
                <div>
                  <input
                    type="text"
                    value={customRegNumber}
                    onChange={(e) => setCustomRegNumber(e.target.value)}
                    placeholder="e.g. 62-1234 or WP NA-1234"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono uppercase font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
                  />
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs text-slate-500">
                      Single box mode active for vintage or special registration numbers.
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCustomPlate(false)}
                      className="text-xs text-orange-600 hover:text-orange-700 font-semibold underline cursor-pointer"
                    >
                      {t('standardPlateToggle')}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Sri Lanka Seating Layout Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Sri Lankan Seating Layout *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 2x2 Card */}
                <button
                  type="button"
                  onClick={() => handleLayoutChange('2x2')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${layoutType === '2x2' ? 'border-orange-600 bg-orange-50/80 shadow-xs ring-2 ring-orange-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 font-black text-sm text-slate-800">
                        <Armchair className="w-4 h-4 text-orange-600" />
                        <span>2x2 Luxury</span>
                      </div>
                      {layoutType === '2x2' && <Check className="w-4 h-4 text-orange-600 stroke-[3]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      2 Left + Aisle + 2 Right. Expressway & Super Luxury AC coaches.
                    </p>
                  </div>
                  <span className="mt-3 inline-block text-[10px] font-bold text-orange-700 bg-orange-100/70 px-2 py-0.5 rounded">
                    41, 44, 45, 49 Seats
                  </span>
                </button>

                {/* 2x3 Card */}
                <button
                  type="button"
                  onClick={() => handleLayoutChange('2x3')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${layoutType === '2x3' ? 'border-orange-600 bg-orange-50/80 shadow-xs ring-2 ring-orange-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 font-black text-sm text-slate-800">
                        <Users className="w-4 h-4 text-orange-600" />
                        <span>2x3 Normal</span>
                      </div>
                      {layoutType === '2x3' && <Check className="w-4 h-4 text-orange-600 stroke-[3]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      2 Left + Aisle + 3 Right. SLTB / CTB and Private Leyland standard buses.
                    </p>
                  </div>
                  <span className="mt-3 inline-block text-[10px] font-bold text-orange-700 bg-orange-100/70 px-2 py-0.5 rounded">
                    52, 54, 55 Seats
                  </span>
                </button>

                {/* 2+1 Card */}
                <button
                  type="button"
                  onClick={() => handleLayoutChange('2+1')}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${layoutType === '2+1' ? 'border-orange-600 bg-orange-50/80 shadow-xs ring-2 ring-orange-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 font-black text-sm text-slate-800">
                        <Crown className="w-4 h-4 text-purple-600" />
                        <span>2+1 VIP</span>
                      </div>
                      {layoutType === '2+1' && <Check className="w-4 h-4 text-orange-600 stroke-[3]" />}
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      2 Left + Aisle + 1 VIP Single Seat. First-Class luxury liners.
                    </p>
                  </div>
                  <span className="mt-3 inline-block text-[10px] font-bold text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded">
                    24, 28, 30, 32 Seats
                  </span>
                </button>
              </div>
            </div>

            {/* Back Row Configuration Option (for 2x2 layout) */}
            {layoutType === '2x2' && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Rear Row Arrangement (Back Row)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setBackRowType('5-seater');
                      if (totalSeats === 40 || totalSeats === 44) setTotalSeats(totalSeats + 1);
                    }}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${backRowType === '5-seater' ? 'border-orange-500 bg-white shadow-xs text-orange-950 ring-1 ring-orange-200' : 'border-slate-200 text-slate-600 bg-white/60 hover:bg-white'}`}
                  >
                    <div className="font-bold text-slate-800 mb-0.5">5-Seater Rear Bench</div>
                    <div className="text-[11px] text-slate-500">Connected 5 seats without aisle gap (41, 45, 49 seats)</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBackRowType('4-seater');
                      if (totalSeats === 45 || totalSeats === 49 || totalSeats === 41) setTotalSeats(totalSeats - 1);
                    }}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${backRowType === '4-seater' ? 'border-orange-500 bg-white shadow-xs text-orange-950 ring-1 ring-orange-200' : 'border-slate-200 text-slate-600 bg-white/60 hover:bg-white'}`}
                  >
                    <div className="font-bold text-slate-800 mb-0.5">4-Seater with Walkway Aisle</div>
                    <div className="text-[11px] text-slate-500">Aisle maintained in rear row (40, 44, 48 seats)</div>
                  </button>
                </div>
              </div>
            )}

            {/* Total Seating Capacity Presets & Custom Input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {t('totalSeats')}
                </label>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                  {totalSeats} Passenger Seats • {rows} Rows
                </span>
              </div>

              {/* Presets */}
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-3">
                {(layoutType === '2x3'
                  ? [49, 52, 54, 55, 59]
                  : layoutType === '2+1'
                  ? [24, 28, 30, 32]
                  : [40, 41, 44, 45, 49, 53]
                ).map((seats) => (
                  <button
                    key={seats}
                    type="button"
                    onClick={() => handleSeatPresetSelect(seats)}
                    className={`py-2 rounded-xl border text-xs font-bold transition cursor-pointer ${totalSeats === seats ? 'border-orange-600 bg-orange-50 text-orange-700 shadow-xs ring-1 ring-orange-200' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {seats} Seats
                  </button>
                ))}
              </div>

              {/* Direct capacity input */}
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="10"
                  max="75"
                  value={totalSeats}
                  onChange={(e) => setTotalSeats(Number(e.target.value) || 0)}
                  className="w-32 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-xs text-slate-500">
                  Custom capacity (10 to 75 seats)
                </span>
              </div>

              {/* Smart Sri Lanka Bus Layout Suggestion when 54 or 55 seats is entered in 2x2 */}
              {is55in2x2 && (
                <div className="mt-3.5 p-4 rounded-2xl bg-amber-50 border border-amber-300 shadow-2xs">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">💡</span>
                    <h4 className="font-black text-xs text-amber-950 uppercase tracking-wider">
                      Sri Lankan Bus Seating Recommendation
                    </h4>
                  </div>
                  <p className="text-xs text-amber-900 leading-relaxed mb-3">
                    In Sri Lanka, <strong className="font-black text-slate-900">55 seats</strong> is the standard 11-row capacity of a <strong className="text-orange-700">2x3 Normal Bus (SLTB CTB / Ashok Leyland)</strong>. Under 2x2 Luxury, 55 seats leaves the 5-seater rear bench incomplete (only 3 of 5 seats filled).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleLayoutChange('2x3');
                        setTotalSeats(55);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>🚌 {t('switchTo2x3')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeatPresetSelect(53)}
                      className="px-3 py-2 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 font-bold text-xs shadow-2xs transition cursor-pointer active:scale-95"
                    >
                      {t('adjustTo53')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeatPresetSelect(57)}
                      className="px-3 py-2 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-950 font-bold text-xs shadow-2xs transition cursor-pointer active:scale-95"
                    >
                      {t('adjustTo57')}
                    </button>
                  </div>
                </div>
              )}

              {/* General Incomplete Row Warning for other odd numbers */}
              {isIncomplete2x2 && !is55in2x2 && (
                <div className="mt-3.5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  <p className="font-semibold mb-2">
                    ⚠️ {t('incompleteRowWarning')} {backRowType === '5-seater' ? `(Only ${((totalSeats - 5) % 4) + 1} of 5 rear bench seats).` : `(Only ${(totalSeats % 4)} of 4 seats in rear row).`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSeatPresetSelect(lowerFullSeats)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-bold text-xs cursor-pointer hover:bg-amber-100 active:scale-95"
                    >
                      Adjust to {lowerFullSeats} Seats (Full Bench)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSeatPresetSelect(upperFullSeats)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-bold text-xs cursor-pointer hover:bg-amber-100 active:scale-95"
                    >
                      Adjust to {upperFullSeats} Seats (Full Bench)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Amenities Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                {t('amenities')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {COMMON_AMENITIES.map((amenity) => {
                  const isSelected = selectedAmenities.includes(amenity.label);
                  const Icon = amenity.icon;
                  return (
                    <button
                      key={amenity.id}
                      type="button"
                      onClick={() => toggleAmenity(amenity.label)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${isSelected ? 'border-orange-500 bg-orange-50/60 text-orange-950' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${isSelected ? 'bg-orange-600 text-white' : 'border border-slate-300 bg-white'}`}>
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </div>
                      <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{amenity.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold py-4 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer text-sm flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('saving')}</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    <span>{t('saveBus')}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Right: Live Visual Layout Preview */}
        <div className="w-full lg:w-92 flex flex-col">
          <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg sticky top-24">
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-800">
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="font-bold text-sm tracking-wide text-slate-200 truncate">
                  {name.trim() || t('layoutPreview')}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="inline-flex items-center bg-amber-400 text-slate-950 font-mono font-black text-[10px] px-2 py-0.5 rounded shadow-2xs">
                    {currentFormattedPlate}
                  </span>
                  <span className="text-[11px] text-orange-400 font-bold">
                    {layoutType === '2x3' 
                      ? '2x3 Normal' 
                      : layoutType === '2+1'
                      ? '2+1 VIP'
                      : '2x2 Luxury'}
                  </span>
                  {isIncomplete2x2 && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600/40 px-2 py-0.5 rounded">
                      ⚠️ Incomplete Row ({backRowType === '5-seater' ? `${((totalSeats - 5) % 4) + 1}/5` : `${totalSeats % 4}/4`} Seats)
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[11px] font-mono bg-slate-800 text-orange-400 px-2.5 py-1 rounded font-bold shrink-0">
                {totalSeats} Seats • {rows}R
              </span>
            </div>

            {/* Bus Coach Preview */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center max-h-[70vh] overflow-y-auto">
              
              {/* Front Cabin (Left Entrance & Right Driver) */}
              <div className="w-full flex items-center justify-between px-2 pb-3 mb-3 border-b border-slate-800 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span className="text-emerald-400 flex items-center gap-1">🚪 Entrance</span>
                <span className="text-slate-500 font-mono text-[9px]">FRONT</span>
                <span className="text-orange-400 flex items-center gap-1">💺 Driver</span>
              </div>

              {/* Passenger Seat Grid */}
              <div className="space-y-1.5 w-full">
                {renderPreviewGrid()}
              </div>

              {/* Rear info */}
              <div className="w-full text-center pt-3 mt-3 border-t border-slate-800 text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                Rear Window
              </div>
            </div>

            {/* Legend & Sri Lanka layout description */}
            <div className="mt-4 pt-3 border-t border-slate-800 space-y-2 text-[11px]">
              <div className="flex flex-wrap items-center gap-2 text-slate-400">
                <span><strong className="text-slate-200">W:</strong> Window</span>
                <span><strong className="text-slate-200">A:</strong> Aisle</span>
                {layoutType === '2x3' && <span><strong className="text-slate-200">M:</strong> Middle</span>}
                {layoutType === '2+1' && <span><strong className="text-purple-400">VIP:</strong> Single</span>}
                {layoutType === '2x2' && backRowType === '5-seater' && (
                  <span><strong className="text-amber-400">C:</strong> Rear Center</span>
                )}
              </div>
              <p className="text-slate-400 leading-relaxed text-[10.5px]">
                {layoutType === '2x3'
                  ? 'Sri Lankan 2x3 Normal arrangement: 2 seats on left, aisle walkway in center, 3 seats on right (Ashok Leyland / CTB standard).'
                  : layoutType === '2+1'
                  ? 'Sri Lankan 2+1 VIP arrangement: 2 seats on left, wide aisle, 1 individual luxury window seat on right.'
                  : `Sri Lankan 2x2 Luxury arrangement: 2 seats on left, aisle in center, 2 seats on right${backRowType === '5-seater' ? ' with 5-seat connected rear bench.' : '.'}`}
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
