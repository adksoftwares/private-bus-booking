"use client";

import { useEffect, useState, useRef } from 'react';
import { ref, onValue, runTransaction } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { SeatLayout } from '@/types/trip';
import { SeatLock } from '@/types/booking';
import { SEAT_LOCK_DURATION_MS } from '@/lib/constants';
import { Check } from 'lucide-react';

interface SeatMapProps {
  tripId: string;
  layout: SeatLayout;
  onSeatSelect?: (seatIds: string[]) => void;
  readOnly?: boolean;
}

export default function SeatMap({ tripId, layout, onSeatSelect, readOnly = false }: SeatMapProps) {
  const { user } = useAuth();
  const [seatStatuses, setSeatStatuses] = useState<Record<string, SeatLock>>({});
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [processingSeat, setProcessingSeat] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [guestSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      let sid = sessionStorage.getItem('bus_guest_session_id');
      if (!sid) {
        sid = 'gst_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
        sessionStorage.setItem('bus_guest_session_id', sid);
      }
      return sid;
    }
    return '';
  });

  const effectiveUserId = user?.uid || guestSessionId;

  const onSeatSelectRef = useRef(onSeatSelect);
  useEffect(() => {
    onSeatSelectRef.current = onSeatSelect;
  }, [onSeatSelect]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!effectiveUserId) return;

    // Real-time seat locks listener
    const locksRef = ref(db, `seatLocks/${tripId}`);
    const unsubscribe = onValue(locksRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as Record<string, SeatLock>;
        const currentTime = Date.now();
        const validStatuses: Record<string, SeatLock> = {};
        
        for (const [seatId, info] of Object.entries(data)) {
          if (info.status === 'booked' || (info.expiresAt && info.expiresAt > currentTime)) {
            validStatuses[seatId] = info;
          }
        }
        setSeatStatuses(validStatuses);

        // Deselect local seats if expired or claimed
        setSelectedSeats(prev => {
          const filtered = prev.filter(s => {
            const sInfo = validStatuses[s];
            return sInfo && sInfo.status === 'locked' && sInfo.userId === effectiveUserId;
          });
          if (filtered.length !== prev.length && onSeatSelectRef.current) {
            const cb = onSeatSelectRef.current;
            setTimeout(() => cb(filtered), 0);
          }
          return filtered;
        });
      } else {
        setSeatStatuses({});
      }
    });

    return () => unsubscribe();
  }, [tripId, effectiveUserId]);

  const handleSeatClick = async (seatId: string) => {
    if (readOnly || !effectiveUserId || processingSeat) return;

    const status = seatStatuses[seatId];
    if (status?.status === 'booked') return;
    
    const currentTime = Date.now();
    if (status?.status === 'locked' && status.userId !== effectiveUserId && status.expiresAt && status.expiresAt > currentTime) {
      return;
    }

    setProcessingSeat(seatId);

    try {
      const isAlreadySelected = selectedSeats.includes(seatId);

      if (isAlreadySelected) {
        // Deselect -> Remove lock atomically
        await runTransaction(ref(db, `seatLocks/${tripId}/${seatId}`), (current: SeatLock | null) => {
          if (current && current.status === 'locked' && current.userId === effectiveUserId) {
            return null;
          }
          return current;
        });

        const updated = selectedSeats.filter(s => s !== seatId);
        setSelectedSeats(updated);
        if (onSeatSelect) onSeatSelect(updated);
      } else {
        if (selectedSeats.length >= 6) {
          alert("Maximum 6 seats allowed per reservation.");
          return;
        }

        const lockExpiry = Date.now() + SEAT_LOCK_DURATION_MS;
        const result = await runTransaction(ref(db, `seatLocks/${tripId}/${seatId}`), (current: SeatLock | null) => {
          const transTime = Date.now();
          if (current) {
            if (current.status === 'booked') return;
            if (current.status === 'locked' && current.userId !== effectiveUserId && current.expiresAt && current.expiresAt > transTime) {
              return;
            }
          }
          return {
            userId: effectiveUserId,
            status: 'locked' as const,
            expiresAt: lockExpiry
          };
        });

        if (!result.committed) {
          alert(`Seat ${seatId} was just reserved by another passenger. Please choose another seat.`);
          return;
        }

        const updated = [...selectedSeats, seatId];
        setSelectedSeats(updated);
        if (onSeatSelect) onSeatSelect(updated);
      }
    } catch (err) {
      console.error("Atomic seat lock error:", err);
    } finally {
      setProcessingSeat(null);
    }
  };

  const rawType = (layout?.type || '').toLowerCase().replace(':', 'x').replace('+', 'x');
  const is2x3 = rawType === '2x3' || rawType === '3x2' || layout?.cols === 5;
  const is2x1 = rawType === '2x1' || rawType === '2+1' || (layout?.cols === 3 && layout?.aisleCol === 2);
  const is2x2 = !is2x3 && !is2x1;

  const totalGridCols = is2x3 ? 6 : is2x2 ? 5 : 4;
  const aisleColIndex = 2; // Index 2 is the aisle

  const rows = layout?.rows || (is2x3 ? 11 : is2x2 ? 11 : 10);
  const totalSeats = layout?.totalSeats || (is2x3 ? 54 : is2x2 ? 45 : 30);

  const hasConnectedBackRow = is2x2 && (
    layout?.backRowType === '5-seater' ||
    (layout?.backRowType !== '4-seater' && layout?.backRowType !== 'with-aisle' && (totalSeats % 4 === 1))
  );

  const getSeatPosition = (c: number, isLastRow: boolean): { code: 'W' | 'A' | 'M' | 'VIP' | 'C'; label: string } => {
    if (isLastRow && hasConnectedBackRow && c === aisleColIndex) {
      return { code: 'C', label: 'Rear Center Seat' };
    }

    if (is2x3) {
      if (c === 0) return { code: 'W', label: 'Left Window Seat' };
      if (c === 1) return { code: 'A', label: 'Left Aisle Seat' };
      if (c === 3) return { code: 'A', label: 'Right Aisle Seat' };
      if (c === 4) return { code: 'M', label: 'Right Middle Seat' };
      if (c === 5) return { code: 'W', label: 'Right Window Seat' };
    } else if (is2x2) {
      if (c === 0) return { code: 'W', label: 'Left Window Seat' };
      if (c === 1) return { code: 'A', label: 'Left Aisle Seat' };
      if (c === 3) return { code: 'A', label: 'Right Aisle Seat' };
      if (c === 4) return { code: 'W', label: 'Right Window Seat' };
    } else if (is2x1) {
      if (c === 0) return { code: 'W', label: 'Left Window Seat' };
      if (c === 1) return { code: 'A', label: 'Left Aisle Seat' };
      if (c === 3) return { code: 'VIP', label: 'Single Window Seat' };
    }

    return { code: 'W', label: 'Window Seat' };
  };

  const renderGrid = () => {
    const grid = [];
    let seatNumber = 1;

    for (let r = 0; r < rows; r++) {
      const row = [];
      const isLastRow = (r === rows - 1);

      for (let c = 0; c < totalGridCols; c++) {
        const isCenterBackSeat = isLastRow && hasConnectedBackRow && c === aisleColIndex && seatNumber <= totalSeats;

        if (c === aisleColIndex && !isCenterBackSeat) {
          row.push(
            <div 
              key={`aisle-${r}`} 
              className={`${is2x3 ? 'w-5 sm:w-6' : is2x1 ? 'w-8 sm:w-10' : 'w-6 sm:w-8'} flex items-center justify-center shrink-0`}
              title="Walkway Aisle"
            >
              <div className="h-full w-px border-r border-dashed border-slate-300/80"></div>
            </div>
          );
        } else {
          if (seatNumber > totalSeats) {
            const emptySize = is2x3 
              ? 'w-10 sm:w-11 h-13 sm:h-14' 
              : is2x1 
              ? 'w-13 sm:w-14 h-14 sm:h-15' 
              : 'w-11 sm:w-12 h-14 sm:h-15';
            row.push(
              <div 
                key={`empty-${r}-${c}`} 
                className={`${emptySize} opacity-0 pointer-events-none shrink-0`}
              />
            );
            continue;
          }

          const seatId = `S${seatNumber}`;
          seatNumber++;
          
          const seatType = getSeatPosition(c, isLastRow);
          const statusInfo = seatStatuses[seatId];
          const isBooked = statusInfo?.status === 'booked';
          const isLockedByMe = statusInfo?.status === 'locked' && statusInfo.userId === effectiveUserId;
          const isLockedByOther = statusInfo?.status === 'locked' && statusInfo.userId !== effectiveUserId && Boolean(statusInfo.expiresAt && statusInfo.expiresAt > now);
          const isSelected = selectedSeats.includes(seatId);
          const isProcessing = processingSeat === seatId;
          
          let seatStyle = 'bg-white border-slate-300 text-slate-800 hover:border-orange-500 hover:shadow-sm';
          
          if (isBooked) {
            seatStyle = 'bg-slate-200/90 border-slate-300 text-slate-400 opacity-60 cursor-not-allowed';
          } else if (isLockedByOther) {
            seatStyle = 'bg-amber-50 border-amber-300 text-amber-700 cursor-not-allowed';
          } else if (isSelected || isLockedByMe) {
            seatStyle = 'bg-orange-600 border-orange-700 text-white shadow-sm ring-2 ring-orange-200';
          }

          const seatSize = is2x3 
            ? 'w-10 sm:w-11 h-13 sm:h-14' 
            : is2x1 
            ? 'w-13 sm:w-14 h-14 sm:h-15' 
            : 'w-11 sm:w-12 h-14 sm:h-15';

          row.push(
            <button
              key={seatId}
              type="button"
              disabled={readOnly || isBooked || isLockedByOther || isProcessing}
              onClick={() => handleSeatClick(seatId)}
              className={`${seatSize} relative flex flex-col items-center justify-between py-1.5 px-0.5 border-2 rounded-t-xl rounded-b-md transition-all duration-150 shrink-0 ${seatStyle} ${(!isBooked && !isLockedByOther) ? 'active:scale-95 cursor-pointer' : ''}`}
              title={`${seatId} • ${seatType.label} • ${isBooked ? 'Booked' : isLockedByOther ? 'Reserved (10m)' : isSelected ? 'Selected' : 'Available'}`}
            >
              {/* Headrest curve top accent */}
              <div className={`w-6 h-1 rounded-full mb-0.5 ${isSelected || isLockedByMe ? 'bg-orange-400' : 'bg-slate-200'}`} />

              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin my-auto"></div>
              ) : (
                <>
                  <span className="text-[11px] sm:text-xs font-black tracking-tight leading-none">
                    {seatId}
                  </span>
                  
                  <div className="flex items-center gap-0.5 leading-none">
                    {isSelected ? (
                      <Check className="w-3 h-3 stroke-[3] text-white" />
                    ) : (
                      <span className={`text-[8.5px] font-black uppercase ${
                        seatType.code === 'VIP' ? 'text-purple-600' : 'text-slate-400'
                      }`}>
                        {seatType.code}
                      </span>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        }
      }
      grid.push(
        <div key={`row-${r}`} className="flex gap-2 mb-2 items-center justify-center">
          {row}
        </div>
      );
    }
    return grid;
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 bg-slate-50 border border-slate-200 rounded-3xl shadow-inner max-w-xl mx-auto">
      
      {/* Sri Lanka Bus Layout Type Pill */}
      <div className="mb-5 text-center">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs bg-white border border-slate-200 text-slate-800">
          <span className="w-2 h-2 rounded-full bg-orange-600"></span>
          {is2x3 ? '2x3 Normal Bus (2 Left + Aisle + 3 Right)' : is2x1 ? '2+1 VIP Sleeper Bus (2 Left + Aisle + 1 Single)' : '2x2 Luxury Express (2 Left + Aisle + 2 Right)'}
        </span>
      </div>

      {/* Realistic Curved Front Coach Windshield */}
      <div className="w-full max-w-sm mb-4">
        <div className="h-4 bg-slate-300 rounded-t-3xl border-t-2 border-x-2 border-slate-400/80 mx-2 shadow-xs flex items-center justify-center">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Front Windshield</span>
        </div>
      </div>

      {/* Driver Cabin (Right in Sri Lanka RHD) & Passenger Door (Left) */}
      <div className="w-full max-w-sm border-b-2 border-slate-300 pb-3 mb-5 flex justify-between items-center px-4">
        
        {/* Entrance Door (Left) */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl border border-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs bg-white shadow-2xs">
            🚪
          </div>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Passenger Entry</span>
        </div>

        {/* Driver Cabin (Right - Sri Lanka RHD) */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Driver Cabin</span>
          <div className="w-8 h-8 rounded-xl border border-slate-300 flex items-center justify-center text-slate-600 font-bold text-xs bg-white shadow-2xs" title="Driver Wheel">
            💺
          </div>
        </div>
      </div>
      
      {/* Bus Seats Grid Container */}
      <div className="flex flex-col gap-1 overflow-x-auto max-w-full pb-3 px-2">
        {renderGrid()}
      </div>

      {/* Rear Coach Marker */}
      <div className="w-full max-w-sm text-center pt-3 mt-1 border-t-2 border-slate-300 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        REAR OF BUS
      </div>

      {/* Seat State Legend */}
      <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-slate-200 w-full justify-center text-xs font-semibold text-slate-700">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-white border-2 border-slate-300 rounded-sm"></div> 
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-orange-600 border-2 border-orange-700 rounded-sm"></div> 
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-amber-50 border-2 border-amber-300 rounded-sm"></div> 
          <span>Reserved (10m)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-slate-200 border-2 border-slate-300 rounded-sm opacity-60"></div> 
          <span>Booked</span>
        </div>
      </div>

      {/* Seat Position Keys */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2.5 text-[11px] text-slate-500 font-medium justify-center">
        <span><strong className="text-slate-700 font-bold">W:</strong> Window</span>
        <span><strong className="text-slate-700 font-bold">A:</strong> Aisle</span>
        {is2x3 && <span><strong className="text-slate-700 font-bold">M:</strong> Middle</span>}
        {is2x1 && <span><strong className="text-purple-700 font-bold">VIP:</strong> Single Sleeper</span>}
        {hasConnectedBackRow && <span><strong className="text-slate-700 font-bold">C:</strong> Rear Center</span>}
      </div>
    </div>
  );
}
