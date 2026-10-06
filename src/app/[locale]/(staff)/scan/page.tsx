"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { Trip } from '@/types/trip';

interface VerificationResult {
  valid: boolean;
  canBoard?: boolean;
  boarded?: boolean;
  reason?: string;
  message: string;
  boardedAt?: number;
  booking?: Booking;
  trip?: Trip;
}

export default function ScannerPage() {
  const { user, isStaff, loading: authLoading } = useAuth();
  const [bookingId, setBookingId] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardingLoading, setBoardingLoading] = useState(false);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!bookingId.trim() || !user) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: bookingId.trim().toUpperCase(),
          staffUid: user.uid,
          action: 'lookup'
        })
      });

      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Verification error:", error);
      setResult({
        valid: false,
        message: error.message || 'Verification network request failed.'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBoardPassenger = async () => {
    if (!result?.booking || !user) return;
    setBoardingLoading(true);

    try {
      const res = await fetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: result.booking.id,
          staffUid: user.uid,
          action: 'board'
        })
      });

      const data = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Boarding error:", error);
      alert("Failed to confirm boarding: " + error.message);
    } finally {
      setBoardingLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Verifying staff credentials...</p>
      </div>
    );
  }

  if (!user || !isStaff) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-white border border-red-200 rounded-2xl shadow-sm">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-slate-500 text-sm mb-6">
          This terminal is restricted to authorized bus conductors, operators, and administrative staff only.
        </p>
        <Link href="/" className="inline-block bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-orange-700 transition">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto my-10 px-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Terminal Header */}
        <div className="bg-slate-900 text-white p-6 text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2">
            <span>🛡️</span> Conductor Verification Terminal
          </div>
          <h1 className="text-2xl font-black">Ticket Verification & Boarding</h1>
          <p className="text-xs text-slate-400 mt-1">Conductor / Staff UID: {user.uid.slice(0, 8)}...</p>
        </div>

        <div className="p-6">
          {/* Input Form */}
          <form onSubmit={handleVerify} className="space-y-4 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Scan or Enter Booking Reference
              </label>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="e.g. BK-1787738021434" 
                  value={bookingId} 
                  onChange={e => setBookingId(e.target.value)} 
                  className="flex-1 p-3.5 border border-slate-300 rounded-xl font-mono text-base uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
                  required
                />
                <button 
                  type="submit" 
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Checking...' : 'Verify'}
                </button>
              </div>
            </div>
          </form>

          {/* Verification Result Card */}
          {result && (
            <div className={`p-6 rounded-2xl border transition-all ${
              result.boarded 
                ? 'bg-purple-50 border-purple-200 text-purple-900' 
                : result.valid && result.canBoard 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              {/* Status Header */}
              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-current/10">
                <span className="text-2xl">
                  {result.boarded ? '🟣' : result.valid ? '✅' : '❌'}
                </span>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    {result.boarded 
                      ? 'PASSENGER BOARDED' 
                      : result.valid 
                      ? 'TICKET VERIFIED — READY TO BOARD' 
                      : 'TICKET REJECTED'}
                  </h3>
                  <p className="text-xs opacity-80 mt-0.5">{result.message}</p>
                </div>
              </div>

              {/* Ticket Details (if found) */}
              {result.booking && (
                <div className="space-y-3 text-xs sm:text-sm bg-white/70 p-4 rounded-xl mb-4 border border-current/10">
                  <div className="flex justify-between">
                    <span className="opacity-70">Booking ID</span>
                    <span className="font-mono font-bold">{result.booking.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-70">Passenger</span>
                    <span className="font-bold">{result.booking.passengerName}</span>
                  </div>
                  {result.booking.passengerPhone && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Phone</span>
                      <span className="font-mono">{result.booking.passengerPhone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="opacity-70">Seats Assigned</span>
                    <span className="font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                      {result.booking.seats?.join(', ')}
                    </span>
                  </div>
                  {result.trip && (
                    <div className="flex justify-between">
                      <span className="opacity-70">Route & Bus</span>
                      <span className="font-semibold text-right">
                        {result.trip.routeSnapshot?.startCity} &rarr; {result.trip.routeSnapshot?.endCity} ({result.trip.busSnapshot?.name})
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="opacity-70">Booking Status</span>
                    <span className="font-bold uppercase">{result.booking.status}</span>
                  </div>
                </div>
              )}

              {/* Action Button: Board Passenger */}
              {result.valid && result.canBoard && !result.boarded && (
                <button
                  onClick={handleBoardPassenger}
                  disabled={boardingLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer text-sm"
                >
                  {boardingLoading ? 'Recording Boarding...' : '🎫 Check-In & Board Passenger'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
