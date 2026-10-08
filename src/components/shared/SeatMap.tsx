"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { SeatLayout } from '@/types/trip';
import { SeatLock } from '@/types/booking';
import { generateBusSeatGrid } from '@/lib/seat-layout';

interface SeatMapProps {
  tripId: string;
  layout: SeatLayout;
  selectedSeats?: string[];
  onSeatSelect?: (seatIds: string[]) => void;
  readOnly?: boolean;
}

interface SeatButtonProps {
  seatId: string;
  displayNumber: string;
  seatType: { code: 'W' | 'A' | 'M' | 'VIP' | 'C'; label: string };
  isBooked: boolean;
  isLockedByOther: boolean;
  isSelected: boolean;
  isLockedByMe: boolean;
  readOnly: boolean;
  onClick: (seatId: string) => void;
}

// Authentic Coach Bus Seat with Left & Right Armrests, Cushion Clip & Bold 2-digit Number
const SeatButton = memo(function SeatButton({
  seatId,
  displayNumber,
  seatType,
  isBooked,
  isLockedByOther,
  isSelected,
  isLockedByMe,
  readOnly,
  onClick
}: SeatButtonProps) {
  let cushionBg = 'bg-white border-slate-900';
  let numColor = 'text-slate-900';
  let armrestBg = 'bg-white border-slate-900';
  let pillBg = 'bg-slate-950';

  if (isBooked) {
    cushionBg = 'bg-[#dc2626] border-slate-900';
    numColor = 'text-slate-950';
    armrestBg = 'bg-white border-slate-900';
    pillBg = 'bg-slate-950';
  } else if (isLockedByOther) {
    cushionBg = 'bg-amber-100 border-amber-500';
    numColor = 'text-amber-950';
    armrestBg = 'bg-amber-50 border-amber-500';
    pillBg = 'bg-amber-900';
  } else if (isSelected || isLockedByMe) {
    cushionBg = 'bg-[#ea580c] border-slate-900';
    numColor = 'text-slate-950';
    armrestBg = 'bg-white border-slate-900';
    pillBg = 'bg-slate-950';
  }

  const disabled = readOnly || isBooked || isLockedByOther;

  return (
    <div 
      className="relative inline-flex items-center justify-center p-0.5 select-none shrink-0"
      title={`${seatId} (${displayNumber}) • ${seatType.label} • ${isBooked ? 'Booked' : isLockedByOther ? 'Reserved (10m)' : isSelected ? 'Selected' : 'Available'}`}
    >
      {/* Left Armrest */}
      <div className={`w-1 sm:w-1.5 h-6.5 sm:h-7.5 border ${armrestBg} rounded-l-sm sm:rounded-l-md shrink-0 shadow-2xs -mr-[1px] z-0`} />

      {/* Main Seat Cushion */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onClick(seatId)}
        className={`w-7.5 sm:w-9 h-11 sm:h-12 border ${cushionBg} rounded-t-md sm:rounded-t-lg rounded-b-xs sm:rounded-b-sm flex flex-col items-center justify-between py-1 shrink-0 z-10 transition-all ${!disabled ? 'cursor-pointer hover:brightness-95 active:scale-95' : 'cursor-not-allowed'}`}
      >
        <div className="w-full" />
        <span className={`text-[11px] sm:text-xs font-black tracking-tight leading-none ${numColor}`}>
          {displayNumber}
        </span>
        {/* Bottom cushion detail pill */}
        <div className={`w-3.5 sm:w-4 h-1 sm:h-1.5 ${pillBg} rounded-xs`} />
      </button>

      {/* Right Armrest */}
      <div className={`w-1 sm:w-1.5 h-6.5 sm:h-7.5 border ${armrestBg} rounded-r-sm sm:rounded-r-md shrink-0 shadow-2xs -ml-[1px] z-0`} />
    </div>
  );
});

export default function SeatMap({ 
  tripId, 
  layout, 
  selectedSeats: initialSelectedSeats, 
  onSeatSelect, 
  readOnly = false 
}: SeatMapProps) {
  const { user, authFetch } = useAuth();
  const [seatStatuses, setSeatStatuses] = useState<Record<string, SeatLock>>({});
  const [selectedSeats, setSelectedSeats] = useState<string[]>(() => initialSelectedSeats || []);
  
  // Track user's intended state per seat so rapid clicks never get out of sync with network
  const targetSeatIntentRef = useRef<Map<string, boolean>>(new Map());
  const pendingRequestsRef = useRef<Map<string, AbortController>>(new Map());

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

  // Synchronize when initialSelectedSeats prop changes externally
  useEffect(() => {
    if (initialSelectedSeats) {
      setSelectedSeats(initialSelectedSeats);
    }
  }, [initialSelectedSeats]);

  const fetchSeatStatuses = useCallback(async () => {
    if (!tripId) return;
    try {
      const fetcher = authFetch || fetch;
      const res = await fetcher(`/api/seats/status?tripId=${encodeURIComponent(tripId)}&sessionId=${encodeURIComponent(effectiveUserId)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.statuses) {
        const statuses = data.statuses as Record<string, SeatLock>;
        setSeatStatuses(statuses);

        // Deselect local seats ONLY if explicitly booked or locked by another passenger
        setSelectedSeats(prev => {
          const filtered = prev.filter(s => {
            const sInfo = statuses[s];
            if (!sInfo) return true; // keep optimistic selection while sync completes
            if (sInfo.status === 'booked') return false;
            const isLockedByOther = sInfo.status === 'locked' && !sInfo.isMine && sInfo.userId !== effectiveUserId;
            if (isLockedByOther) return false;
            return true;
          });
          if (filtered.length !== prev.length && onSeatSelectRef.current) {
            const cb = onSeatSelectRef.current;
            setTimeout(() => cb(filtered), 0);
          }
          return filtered;
        });
      }
    } catch (e) {
      console.warn("Error fetching seat statuses:", e);
    }
  }, [tripId, effectiveUserId, authFetch]);

  useEffect(() => {
    let isCancelled = false;

    const loadInitialStatuses = async () => {
      if (!tripId) return;
      try {
        const fetcher = authFetch || fetch;
        const res = await fetcher(`/api/seats/status?tripId=${encodeURIComponent(tripId)}&sessionId=${encodeURIComponent(effectiveUserId)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!isCancelled && data.statuses) {
          setSeatStatuses(data.statuses as Record<string, SeatLock>);
        }
      } catch (e) {
        console.warn("Error fetching seat statuses:", e);
      }
    };

    loadInitialStatuses();

    // Supabase Realtime channel subscription
    const channel = supabase
      .channel(`seat_locks_live_${tripId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'seat_locks',
          filter: `trip_id=eq.${tripId}`
        },
        () => {
          fetchSeatStatuses();
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchSeatStatuses();
    }, 15000);

    return () => {
      isCancelled = true;
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [tripId, fetchSeatStatuses, effectiveUserId, authFetch]);

  // Non-blocking, instant 0.00ms physical feedback handler
  const handleSeatClick = useCallback((seatId: string) => {
    if (readOnly || !effectiveUserId) return;

    const status = seatStatuses[seatId];
    if (status?.status === 'booked') return;
    
    const currentTime = Date.now();
    if (status?.status === 'locked' && status.userId !== effectiveUserId && !status.isMine && status.expiresAt && status.expiresAt > currentTime) {
      return;
    }

    const isCurrentlySelected = selectedSeats.includes(seatId);
    const willBeSelected = !isCurrentlySelected;

    if (willBeSelected && selectedSeats.length >= 6) {
      alert("Maximum 6 seats allowed per reservation.");
      return;
    }

    // 1. Instant 0.00ms UI Update
    const nextSelected = willBeSelected 
      ? [...selectedSeats, seatId] 
      : selectedSeats.filter(s => s !== seatId);

    setSelectedSeats(nextSelected);
    targetSeatIntentRef.current.set(seatId, willBeSelected);

    if (willBeSelected) {
      setSeatStatuses(prev => ({
        ...prev,
        [seatId]: {
          status: 'locked',
          isMine: true,
          userId: effectiveUserId,
          expiresAt: Date.now() + 600000
        }
      }));
    } else {
      setSeatStatuses(prev => {
        const copy = { ...prev };
        delete copy[seatId];
        return copy;
      });
    }

    if (onSeatSelect) onSeatSelect(nextSelected);

    // 2. Abort previous pending in-flight request for this seat to eliminate race conditions
    const prevController = pendingRequestsRef.current.get(seatId);
    if (prevController) {
      prevController.abort();
    }

    const abortController = new AbortController();
    pendingRequestsRef.current.set(seatId, abortController);
    const fetcher = authFetch || fetch;

    if (willBeSelected) {
      fetcher('/api/seats/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          seatId,
          guestSessionId: effectiveUserId
        }),
        signal: abortController.signal
      })
        .then(async res => {
          if (abortController.signal.aborted) return;
          const resData = await res.json();

          // Check if user has since unselected this seat
          if (!targetSeatIntentRef.current.get(seatId)) {
            fetcher('/api/seats/unlock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId, seatId, guestSessionId: effectiveUserId })
            }).catch(() => {});
            return;
          }

          if (!res.ok || !resData.success) {
            // Revert optimistic selection on genuine conflict/failure
            setSelectedSeats(prev => {
              const reverted = prev.filter(s => s !== seatId);
              if (onSeatSelectRef.current) onSeatSelectRef.current(reverted);
              return reverted;
            });
            setSeatStatuses(prev => {
              const copy = { ...prev };
              delete copy[seatId];
              return copy;
            });
            targetSeatIntentRef.current.set(seatId, false);
            alert(resData.message || resData.error || `Seat ${seatId} was just reserved by another passenger. Please choose another seat.`);
            fetchSeatStatuses();
          }
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.warn("Background lock error:", err);
        })
        .finally(() => {
          if (pendingRequestsRef.current.get(seatId) === abortController) {
            pendingRequestsRef.current.delete(seatId);
          }
        });
    } else {
      fetcher('/api/seats/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          seatId,
          guestSessionId: effectiveUserId
        }),
        signal: abortController.signal
      })
        .then(async () => {
          if (abortController.signal.aborted) return;
          // If user re-selected before unlock finished, restore lock
          if (targetSeatIntentRef.current.get(seatId)) {
            fetcher('/api/seats/lock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tripId, seatId, guestSessionId: effectiveUserId })
            }).catch(() => {});
          }
        })
        .catch(err => {
          if (err.name === 'AbortError') return;
          console.warn("Background unlock failed:", err);
        })
        .finally(() => {
          if (pendingRequestsRef.current.get(seatId) === abortController) {
            pendingRequestsRef.current.delete(seatId);
          }
        });
    }
  }, [readOnly, effectiveUserId, seatStatuses, selectedSeats, onSeatSelect, tripId, authFetch, fetchSeatStatuses]);

  // Generate authoritative bus seating topology matching real Sri Lankan buses
  const { layoutType, grid } = useMemo(() => {
    return generateBusSeatGrid(
      layout?.type,
      layout?.totalSeats,
      layout?.backRowType
    );
  }, [layout]);

  const renderGrid = () => {
    const now = Date.now();

    return grid.map((rowCells, r) => (
      <div key={`row-${r}`} className="flex gap-1 sm:gap-1.5 mb-1 sm:mb-1.5 items-center justify-center">
        {rowCells.map((cell, c) => {
          if (cell.type === 'aisle') {
            return (
              <div 
                key={`aisle-${r}-${c}`} 
                className={`${layoutType === '2x3' ? 'w-4 sm:w-5' : layoutType === '2+1' ? 'w-6 sm:w-8' : 'w-5 sm:w-6'} flex items-center justify-center shrink-0`}
                title="Walkway Aisle"
              >
                <div className="h-full w-px border-r border-dashed border-slate-300"></div>
              </div>
            );
          }

          if (cell.type === 'empty') {
            return (
              <div 
                key={`empty-${r}-${c}`} 
                className="w-8.5 sm:w-10.5 h-11 sm:h-12 shrink-0 opacity-0 pointer-events-none" 
              />
            );
          }

          // Seat Cell
          const seatId = cell.seatId || `S${cell.seatNumber}`;
          const displayNumber = cell.displayNumber || String(cell.seatNumber).padStart(2, '0');
          const seatType = {
            code: cell.seatCode || 'W',
            label: cell.label || 'Passenger Seat'
          };

          const statusInfo = seatStatuses[seatId] || seatStatuses[displayNumber] || seatStatuses[String(cell.seatNumber)];
          const isBooked = statusInfo?.status === 'booked';
          const isLockedByMe = statusInfo?.status === 'locked' && Boolean(statusInfo.isMine || statusInfo.userId === effectiveUserId);
          const isLockedByOther = statusInfo?.status === 'locked' && !statusInfo.isMine && statusInfo.userId !== effectiveUserId && Boolean(statusInfo.expiresAt && statusInfo.expiresAt > now);
          const isSelected = selectedSeats.includes(seatId) || selectedSeats.includes(displayNumber);

          return (
            <SeatButton
              key={seatId}
              seatId={seatId}
              displayNumber={displayNumber}
              seatType={seatType}
              isBooked={isBooked}
              isLockedByOther={isLockedByOther}
              isSelected={isSelected}
              isLockedByMe={isLockedByMe}
              readOnly={readOnly}
              onClick={handleSeatClick}
            />
          );
        })}
      </div>
    ));
  };

  return (
    <div className="flex flex-col items-center p-3 sm:p-6 bg-slate-50 border border-slate-200 rounded-3xl shadow-inner max-w-lg mx-auto w-full">
      
      {/* Sri Lanka Bus Layout Type Pill */}
      <div className="mb-4 text-center">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs bg-white border border-slate-200 text-slate-800">
          <span className="w-2 h-2 rounded-full bg-orange-600"></span>
          {layoutType === '2x3' 
            ? '2x3 Normal Bus (2 Left + Aisle + 3 Right)' 
            : layoutType === '2+1' 
            ? '2+1 VIP Sleeper (2 Left + Aisle + 1 Single)' 
            : '2x2 Luxury Express (2 Left + Aisle + 2 Right)'}
        </span>
      </div>

      {/* Front Header with clean divider line matching user screenshot */}
      <div className="w-full max-w-xs sm:max-w-sm flex flex-col items-center mb-4">
        <span className="text-xs sm:text-sm font-black text-slate-700 tracking-wider mb-1.5 uppercase">
          Front
        </span>
        <div className="w-full h-1 bg-slate-400 rounded-full" />
      </div>

      {/* Bus Seats Grid Container */}
      <div className="flex flex-col gap-0.5 overflow-x-auto max-w-full pb-2 px-1">
        {renderGrid()}
      </div>

      {/* Rear Coach Marker */}
      <div className="w-full max-w-xs sm:max-w-sm text-center pt-3 mt-1 border-t border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        Rear of Bus
      </div>

      {/* Seat State Legend matching authentic bus booking interface */}
      <div className="flex flex-wrap gap-3 sm:gap-4 mt-5 pt-3 border-t border-slate-200 w-full justify-center text-xs font-semibold text-slate-700">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-white border border-slate-900 rounded-sm"></div> 
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-[#ea580c] border border-slate-900 rounded-sm"></div> 
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-[#dc2626] border border-slate-900 rounded-sm"></div> 
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 bg-amber-100 border border-amber-500 rounded-sm"></div> 
          <span>Reserved (10m)</span>
        </div>
      </div>

      {/* Seat Position Keys */}
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-slate-500 font-medium justify-center">
        <span><strong className="text-slate-700 font-bold">W:</strong> Window</span>
        <span><strong className="text-slate-700 font-bold">A:</strong> Aisle</span>
        {layoutType === '2x3' && <span><strong className="text-slate-700 font-bold">M:</strong> Middle</span>}
        {layoutType === '2+1' && <span><strong className="text-purple-700 font-bold">VIP:</strong> Single Sleeper</span>}
        <span><strong className="text-slate-700 font-bold">C:</strong> Rear Bench</span>
      </div>
    </div>
  );
}
