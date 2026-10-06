"use client";

import { useEffect, useState, useRef } from 'react';
import { ref, onValue, runTransaction } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { SeatLayout } from '@/types/trip';
import { SeatLock } from '@/types/booking';
import { SEAT_LOCK_DURATION_MS } from '@/lib/constants';

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

    // Listen to real-time seat locks/bookings for this trip
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

        // Remove any local selected seats that expired or were taken
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
    
    // If it's booked, ignore
    if (status?.status === 'booked') return;
    
    // If it's locked by someone else and not expired, ignore
    const currentTime = Date.now();
    if (status?.status === 'locked' && status.userId !== effectiveUserId && status.expiresAt && status.expiresAt > currentTime) {
      return;
    }

    setProcessingSeat(seatId);

    try {
      const isAlreadySelected = selectedSeats.includes(seatId);

      if (isAlreadySelected) {
        // Deselect -> Atomic transaction to remove lock
        await runTransaction(ref(db, `seatLocks/${tripId}/${seatId}`), (current: SeatLock | null) => {
          if (current && current.status === 'locked' && current.userId === effectiveUserId) {
            return null; // delete lock
          }
          return current;
        });

        const updated = selectedSeats.filter(s => s !== seatId);
        setSelectedSeats(updated);
        if (onSeatSelect) onSeatSelect(updated);
      } else {
        // Limit max 6 seats
        if (selectedSeats.length >= 6) {
          alert("You can select a maximum of 6 seats per booking.");
          return;
        }

        // Select -> Atomic transaction to acquire lock
        const lockExpiry = Date.now() + SEAT_LOCK_DURATION_MS;
        const result = await runTransaction(ref(db, `seatLocks/${tripId}/${seatId}`), (current: SeatLock | null) => {
          const transTime = Date.now();
          if (current) {
            if (current.status === 'booked') {
              return; // Abort: already booked
            }
            if (current.status === 'locked' && current.userId !== effectiveUserId && current.expiresAt && current.expiresAt > transTime) {
              return; // Abort: locked by someone else
            }
          }
          return {
            userId: effectiveUserId,
            status: 'locked' as const,
            expiresAt: lockExpiry
          };
        });

        if (!result.committed) {
          alert(`Seat ${seatId} was just reserved by another passenger. Please select a different seat.`);
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

  // Total grid columns:
  // 2x3 Normal: 6 (0=L-Win, 1=L-Aisle, 2=Aisle/Center, 3=R-Aisle, 4=R-Mid, 5=R-Win)
  // 2x2 Luxury: 5 (0=L-Win, 1=L-Aisle, 2=Aisle/Center, 3=R-Aisle, 4=R-Win)
  // 2x1 VIP:    4 (0=L-Win, 1=L-Aisle, 2=Aisle, 3=R-Single)
  const totalGridCols = is2x3 ? 6 : is2x2 ? 5 : 4;
  const aisleColIndex = 2; // Always at index 2 (after the 2 left seats)

  const rows = layout?.rows || (is2x3 ? 11 : is2x2 ? 11 : 10);
  const totalSeats = layout?.totalSeats || (is2x3 ? 54 : is2x2 ? 45 : 30);

  // Sri Lanka back row logic:
  // In classic 2x2 with 5-seater rear bench, the aisle space in the back row has a Center seat
  const hasConnectedBackRow = is2x2 && (
    layout?.backRowType === '5-seater' ||
    (layout?.backRowType !== '4-seater' && layout?.backRowType !== 'with-aisle' && (totalSeats % 4 === 1))
  );

  const getSeatPosition = (c: number, isLastRow: boolean): { code: 'W' | 'A' | 'M' | 'VIP' | 'C'; label: string } => {
    if (isLastRow && hasConnectedBackRow && c === aisleColIndex) {
      return { code: 'C', label: 'Rear Center' };
    }

    if (is2x3) {
      if (c === 0) return { code: 'W', label: 'Left Window' };
      if (c === 1) return { code: 'A', label: 'Left Aisle' };
      if (c === 3) return { code: 'A', label: 'Right Aisle' };
      if (c === 4) return { code: 'M', label: 'Right Middle' };
      if (c === 5) return { code: 'W', label: 'Right Window (Driver side)' };
    } else if (is2x2) {
      if (c === 0) return { code: 'W', label: 'Left Window' };
      if (c === 1) return { code: 'A', label: 'Left Aisle' };
      if (c === 3) return { code: 'A', label: 'Right Aisle' };
      if (c === 4) return { code: 'W', label: 'Right Window (Driver side)' };
    } else if (is2x1) {
      if (c === 0) return { code: 'W', label: 'Left Window' };
      if (c === 1) return { code: 'A', label: 'Left Aisle' };
      if (c === 3) return { code: 'VIP', label: 'Right VIP Single Window' };
    }

    return { code: 'W', label: 'Window' };
  };

  const renderGrid = () => {
    const grid = [];
    let seatNumber = 1;

    for (let r = 0; r < rows; r++) {
      const row = [];
      const isLastRow = (r === rows - 1);

      for (let c = 0; c < totalGridCols; c++) {
        // Check if this column is the aisle or a back-row center seat
        const isCenterBackSeat = isLastRow && hasConnectedBackRow && c === aisleColIndex && seatNumber <= totalSeats;

        if (c === aisleColIndex && !isCenterBackSeat) {
          row.push(
            <div 
              key={`aisle-${r}`} 
              className={`${is2x3 ? 'w-5 sm:w-6' : is2x1 ? 'w-8 sm:w-10' : 'w-6 sm:w-8'} flex items-center justify-center`}
              title={isLastRow && is2x3 ? "Rear 5-Seater Bench" : "Walkway Aisle"}
            >
              {isLastRow && is2x3 ? (
                <div className="w-full h-8 bg-slate-200/90 border border-slate-300 rounded flex items-center justify-center shadow-2xs">
                  <span className="text-[7px] sm:text-[8px] font-bold text-slate-500 uppercase tracking-tighter">Bench</span>
                </div>
              ) : (
                <div className="h-full w-px border-r border-dashed border-slate-300"></div>
              )}
            </div>
          );
        } else {
          if (seatNumber > totalSeats) {
            const emptySize = is2x3 
              ? 'w-9 sm:w-10 md:w-11 h-12 sm:h-13' 
              : is2x1 
              ? 'w-13 sm:w-14 h-13 sm:h-14' 
              : 'w-11 sm:w-12 h-13 sm:h-14';
            row.push(
              <div 
                key={`empty-${r}-${c}`} 
                className={`${emptySize} opacity-0 pointer-events-none`}
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
          
          let bgColor = 'bg-white border-slate-300 hover:border-orange-500 hover:text-orange-600 hover:shadow-md';
          let textColor = 'text-slate-700';
          
          if (isBooked) {
            bgColor = 'bg-slate-200 border-slate-300 opacity-60 cursor-not-allowed';
            textColor = 'text-slate-400';
          } else if (isLockedByOther) {
            bgColor = 'bg-amber-50 border-amber-200 cursor-not-allowed';
            textColor = 'text-amber-500';
          } else if (isSelected || isLockedByMe) {
            bgColor = 'bg-orange-500 border-orange-600 shadow-md ring-2 ring-orange-200 ring-offset-1';
            textColor = 'text-white';
          }

          const seatSize = is2x3 
            ? 'w-9 sm:w-10 md:w-11 h-12 sm:h-13' 
            : is2x1 
            ? 'w-13 sm:w-14 h-13 sm:h-14' 
            : 'w-11 sm:w-12 h-13 sm:h-14';

          row.push(
            <button
              key={seatId}
              type="button"
              disabled={readOnly || isBooked || isLockedByOther || isProcessing}
              onClick={() => handleSeatClick(seatId)}
              className={`${seatSize} flex flex-col items-center justify-center border-2 rounded-t-xl rounded-b-md transition-all duration-200 ${bgColor} ${textColor} transform ${(!isBooked && !isLockedByOther) ? 'active:scale-95 cursor-pointer' : ''}`}
              title={`${seatId} • ${seatType.label} • ${isBooked ? 'Booked' : isLockedByOther ? 'Temporarily Reserved' : isSelected ? 'Selected' : 'Available'}`}
            >
              {isProcessing ? (
                <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span className="text-[11px] sm:text-xs font-black tracking-tight leading-none">{seatId}</span>
                  <span className={`text-[8.5px] font-bold uppercase mt-0.5 leading-none ${isSelected || isLockedByMe ? 'text-orange-100' : seatType.code === 'VIP' ? 'text-purple-600 font-black' : 'text-slate-400'}`}>
                    {seatType.code}
                  </span>
                </>
              )}
            </button>
          );
        }
      }
      grid.push(<div key={`row-${r}`} className="flex gap-1.5 sm:gap-2.5 mb-2.5 items-center justify-center">{row}</div>);
    }
    return grid;
  };

  return (
    <div className="flex flex-col items-center p-4 sm:p-6 md:p-8 bg-slate-50 border border-slate-200 rounded-3xl shadow-inner max-w-xl mx-auto">
      {/* Layout Type Badge */}
      <div className="mb-6 text-center">
        {is2x3 ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs bg-amber-50 border border-amber-200 text-amber-800">
            🚌 Sri Lanka Normal Bus (2x3 Layout — 2 Left + Aisle + 3 Right)
          </span>
        ) : is2x1 ? (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs bg-purple-50 border border-purple-200 text-purple-800">
            👑 VIP Super Luxury Bus (2+1 Layout — 2 Left + Aisle + 1 Single Seat)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs bg-emerald-50 border border-emerald-200 text-emerald-800">
            ✨ Luxury / Semi-Luxury Bus (2x2 Layout — 2 Left + Aisle + 2 Right)
          </span>
        )}
      </div>

      {/* Front of bus indicator (Sri Lankan Left Entrance & Right Driver) */}
      <div className="w-full border-b-2 border-slate-300 pb-4 mb-6 flex justify-between items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-slate-400 flex items-center justify-center text-slate-500 font-bold text-xs bg-white">
            🚪
          </div>
          <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Entrance Door</span>
        </div>
        <div className="text-slate-400 font-bold tracking-widest text-[10px] sm:text-xs uppercase bg-slate-200 px-3 py-1 rounded-full">
          FRONT OF BUS
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] sm:text-xs font-bold text-slate-500 uppercase tracking-wider">Driver</span>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-slate-400 flex items-center justify-center text-slate-500 font-bold text-xs bg-white">
            💺
          </div>
        </div>
      </div>
      
      {/* Seats Container */}
      <div className="flex flex-col gap-1 overflow-x-auto max-w-full pb-2 px-1">
        {renderGrid()}
      </div>

      {/* Rear Window Marker */}
      <div className="w-full text-center pt-4 mt-2 border-t-2 border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        REAR WINDOW
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 sm:gap-4 mt-6 pt-4 border-t border-slate-200 w-full justify-center text-xs font-medium text-slate-600">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-white border-2 border-slate-300 rounded"></div> Available</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-orange-500 border-2 border-orange-600 rounded"></div> Selected</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-amber-50 border-2 border-amber-200 rounded"></div> Reserved (10m)</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 bg-slate-200 border-2 border-slate-300 rounded opacity-60"></div> Booked</div>
      </div>

      {/* Seat position legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-3 text-[11px] text-slate-500 font-medium justify-center">
        <span><strong className="text-slate-700">W:</strong> Window Seat</span>
        <span><strong className="text-slate-700">A:</strong> Aisle Seat</span>
        {is2x3 && <span><strong className="text-slate-700">M:</strong> Middle Seat</span>}
        {is2x1 && <span><strong className="text-purple-700 font-bold">VIP:</strong> Single Window Seat</span>}
        {hasConnectedBackRow && <span><strong className="text-slate-700">C:</strong> Rear Center Seat</span>}
      </div>
    </div>
  );
}
