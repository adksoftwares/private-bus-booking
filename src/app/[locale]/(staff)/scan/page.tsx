"use client";

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { Trip } from '@/types/trip';
import { 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  QrCode, 
  Bus as BusIcon, 
  ArrowRight, 
  Phone, 
  Clock, 
  X, 
  Search, 
  CheckCheck, 
  Home
} from 'lucide-react';
import { useTranslations } from 'next-intl';

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
  const { user, isStaff, loading: authLoading, authFetch } = useAuth();
  const t = useTranslations('scanner');
  
  const [bookingId, setBookingId] = useState('');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [boardingLoading, setBoardingLoading] = useState(false);
  
  // Local session shift counter
  const [boardedCount, setBoardedCount] = useState(0);

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!bookingId.trim() || !user) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await authFetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: bookingId.trim().toUpperCase(),
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
      const res = await authFetch('/api/tickets/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: result.booking.id,
          action: 'board'
        })
      });

      const data = await res.json();
      setResult(data);
      if (data.boarded || data.valid) {
        setBoardedCount(prev => prev + 1);
      }
    } catch (err: unknown) {
      const error = err as Error;
      console.error("Boarding error:", error);
      alert("Failed to confirm boarding: " + error.message);
    } finally {
      setBoardingLoading(false);
    }
  };

  const handleClear = () => {
    setBookingId('');
    setResult(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-700 font-bold text-base">Verifying staff credentials...</p>
        <p className="text-slate-400 text-xs mt-1">Conductor security clearance</p>
      </div>
    );
  }

  if (!user || !isStaff) {
    return (
      <div className="max-w-md mx-auto my-20 p-8 text-center bg-white border border-red-200 rounded-3xl shadow-xl">
        <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">Access Restricted</h2>
        <p className="text-slate-500 text-xs sm:text-sm mb-6 leading-relaxed">
          This verification terminal is strictly restricted to verified bus conductors, registered fleet operators, and authorized platform administrators.
        </p>
        <Link 
          href="/" 
          className="inline-flex items-center justify-center gap-2 w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md text-sm"
        >
          <Home className="w-4 h-4" />
          <span>Return to Homepage</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto my-8 sm:my-12 px-4 sm:px-6">
      
      {/* Shift Overview Bar */}
      <div className="bg-slate-900 text-white rounded-3xl shadow-xl border border-slate-800 overflow-hidden mb-6">
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-800">
            <div className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4" />
              <span>{t('terminalBadge')}</span>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Online Terminal</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {t('title')}
              </h1>
              <p className="text-slate-400 text-xs mt-1">
                Conductor UID: <span className="font-mono text-slate-300">{user.uid.slice(0, 8)}...</span> &bull; Shift Active
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/80 px-4 py-2.5 rounded-2xl flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <CheckCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Boarded This Shift
                </span>
                <span className="text-base font-black text-white">
                  {boardedCount} {boardedCount === 1 ? 'Passenger' : 'Passengers'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Terminal Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden p-6 sm:p-8">
        
        {/* Scanner Input Form */}
        <form onSubmit={handleVerify} className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              {t('inputLabel')}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <QrCode className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="e.g. SLB-7K9M-3P2W or BK-178..." 
                  value={bookingId} 
                  onChange={e => setBookingId(e.target.value)} 
                  autoFocus
                  className="w-full pl-11 pr-10 py-3.5 border-2 border-slate-300 focus:border-orange-500 rounded-2xl font-mono text-base uppercase tracking-wider outline-none focus:ring-2 focus:ring-orange-200 transition font-bold" 
                  required
                />
                {bookingId && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    title="Clear input"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <button 
                type="submit" 
                disabled={loading}
                className="bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-bold px-6 rounded-2xl transition shadow-md cursor-pointer disabled:opacity-50 text-sm flex items-center gap-1.5 shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>{loading ? 'Checking...' : t('verifyBtn')}</span>
              </button>
            </div>
          </div>
        </form>

        {/* Verification Result Card */}
        {result && (
          <div className={`p-6 sm:p-8 rounded-3xl border-2 transition-all ${
            result.boarded 
              ? 'bg-purple-50/80 border-purple-300 text-purple-950' 
              : result.valid && result.canBoard 
              ? 'bg-emerald-50/80 border-emerald-400 text-emerald-950' 
              : 'bg-red-50/80 border-red-300 text-red-950'
          }`}>
            
            {/* Status Header */}
            <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-current/15">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs ${
                result.boarded 
                  ? 'bg-purple-200 text-purple-800' 
                  : result.valid 
                  ? 'bg-emerald-200 text-emerald-800' 
                  : 'bg-red-200 text-red-800'
              }`}>
                {result.boarded ? (
                  <CheckCheck className="w-7 h-7" />
                ) : result.valid ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : (
                  <AlertCircle className="w-7 h-7" />
                )}
              </div>
              
              <div>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md inline-block mb-1 ${
                  result.boarded 
                    ? 'bg-purple-200 text-purple-900' 
                    : result.valid 
                    ? 'bg-emerald-200 text-emerald-900' 
                    : 'bg-red-200 text-red-900'
                }`}>
                  {result.boarded 
                    ? 'ALREADY BOARDED' 
                    : result.valid 
                    ? 'VALID & AUTHORIZED' 
                    : 'VERIFICATION REJECTED'}
                </span>
                <h3 className="font-black text-lg sm:text-xl leading-tight">
                  {result.boarded 
                    ? 'Passenger Already Checked In' 
                    : result.valid 
                    ? 'Boarding Approved — Ready to Board' 
                    : 'Invalid or Unconfirmed Booking'}
                </h3>
                <p className="text-xs opacity-85 mt-0.5">{result.message}</p>
              </div>
            </div>

            {/* Ticket Details Box */}
            {result.booking && (
              <div className="bg-white/90 backdrop-blur-xs p-5 rounded-2xl mb-5 border border-current/15 space-y-3.5 text-xs sm:text-sm shadow-xs">
                
                {/* Passenger & Seats Row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Passenger Name
                    </span>
                    <strong className="text-base text-slate-900">{result.booking.passengerName}</strong>
                    {result.booking.passengerPhone && (
                      <span className="flex items-center gap-1 text-slate-500 font-mono text-xs mt-0.5">
                        <Phone className="w-3 h-3" /> {result.booking.passengerPhone}
                      </span>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Assigned Seats ({result.booking.seats?.length || 0})
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5 mt-1">
                      {(result.booking.seats || []).map((s: string) => (
                        <span key={s} className="px-2.5 py-1 bg-orange-600 text-white font-black text-xs rounded-md shadow-2xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Route & Coach Row */}
                {result.trip && (
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Assigned Route
                      </span>
                      <div className="flex items-center gap-1.5 font-bold text-slate-800 text-sm mt-0.5">
                        <span>{result.trip.routeSnapshot?.startCity}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
                        <span>{result.trip.routeSnapshot?.endCity}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Coach Plate & Name
                      </span>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <BusIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-semibold text-slate-800 text-xs">
                          {result.trip.busSnapshot?.name}
                        </span>
                        {result.trip.busSnapshot?.regNumber && (
                          <span className="font-mono text-[10px] font-black bg-amber-300 text-slate-950 px-1.5 py-0.5 rounded border border-slate-900">
                            {result.trip.busSnapshot.regNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Booking ID & Payment Status */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <span className="text-slate-400">Ref: </span>
                    <span className="font-mono font-bold text-slate-800">{result.booking.id}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Payment: </span>
                    <span className="font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Rs. {Number(result.booking.totalAmount).toFixed(2)} (PAID)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Boarded Timestamp (if already boarded) */}
            {result.boarded && result.boardedAt && (
              <div className="flex items-center gap-1.5 text-xs text-purple-700 font-semibold mb-4 bg-purple-100/70 p-2.5 rounded-xl">
                <Clock className="w-3.5 h-3.5" />
                <span>Boarded at {new Date(result.boardedAt).toLocaleTimeString()} on {new Date(result.boardedAt).toLocaleDateString()}</span>
              </div>
            )}

            {/* Action Button: Board Passenger */}
            {result.valid && result.canBoard && !result.boarded && (
              <button
                onClick={handleBoardPassenger}
                disabled={boardingLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black py-4 rounded-2xl transition shadow-lg hover:shadow-xl flex items-center justify-center gap-2 cursor-pointer text-base uppercase tracking-wider"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{boardingLoading ? 'Recording Check-In...' : t('boardPassenger')}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
