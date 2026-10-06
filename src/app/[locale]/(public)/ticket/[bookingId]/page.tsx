"use client";

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter, Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { Trip } from '@/types/trip';
import { 
  Printer, 
  Home, 
  Ticket as TicketIcon, 
  Sparkles, 
  ShieldCheck, 
  KeyRound, 
  Copy, 
  Check, 
  Share2, 
  Calendar, 
  Clock, 
  ArrowRight, 
  AlertCircle,
  Bus as BusIcon,
  Phone,
  User as UserIcon,
  Info
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function TicketPage() {
  const { bookingId } = useParams();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token');
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const t = useTranslations('ticket');
  
  const [booking, setBooking] = useState<Booking | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPhoneVerification, setNeedsPhoneVerification] = useState(false);
  const [verifyPhoneInput, setVerifyPhoneInput] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [showAccountPrompt, setShowAccountPrompt] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linkSuccessNotice, setLinkSuccessNotice] = useState('');
  const [copiedRef, setCopiedRef] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    if (!bookingId) {
      return;
    }

    const localToken = typeof window !== 'undefined' 
      ? (tokenFromUrl || localStorage.getItem(`ticket_token_${bookingId}`) || '')
      : '';

    authFetch('/api/bookings/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: bookingId as string,
        accessToken: localToken,
        userId: user?.uid
      })
    })
      .then(async res => {
        const data = await res.json();
        if (!isMounted) return;
        if (res.ok && data.booking) {
          setBooking(data.booking);
          setTrip(data.trip);
          setNeedsPhoneVerification(false);
          if (data.booking.accessToken && typeof window !== 'undefined') {
            localStorage.setItem(`ticket_token_${bookingId}`, data.booking.accessToken);
          }
        } else if (res.status === 403) {
          setNeedsPhoneVerification(true);
        } else {
          setBooking(null);
        }
      })
      .catch(err => {
        console.error("Failed to load ticket:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [bookingId, user?.uid, tokenFromUrl, authFetch]);

  const handlePhoneVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = verifyPhoneInput.trim();
    if (!phone || !bookingId) return;

    setLoading(true);
    setVerifyError('');

    try {
      const res = await authFetch('/api/bookings/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: bookingId as string,
          phone
        })
      });

      const data = await res.json();

      if (res.ok && data.booking) {
        setBooking(data.booking);
        setTrip(data.trip);
        setNeedsPhoneVerification(false);
        if (data.booking.accessToken && typeof window !== 'undefined') {
          localStorage.setItem(`ticket_token_${bookingId}`, data.booking.accessToken);
        }
      } else if (res.status === 403) {
        setNeedsPhoneVerification(true);
        setVerifyError("Mobile number did not match this booking. Please recheck the phone number used at checkout.");
      } else {
        setBooking(null);
      }
    } catch (err) {
      console.error("Failed to verify ticket:", err);
      setVerifyError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleLinkToMyAccount = async () => {
    if (!user || !booking) return;
    setLinking(true);
    setLinkSuccessNotice('');

    try {
      const token = booking.accessToken || (typeof window !== 'undefined' ? localStorage.getItem(`ticket_token_${booking.id}`) : '');
      const res = await authFetch('/api/bookings/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: booking.id,
          accessToken: token,
          phone: booking.passengerPhone
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link booking to account');
      }

      setLinkSuccessNotice(data.message || 'Successfully linked to your account!');
      setBooking(prev => prev ? { ...prev, userId: user.uid, bookingType: 'account' } : null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link account';
      alert(msg);
    } finally {
      setLinking(false);
    }
  };

  const handleCopyReference = (refText: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(refText);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2500);
    }
  };

  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const shareUrl = window.location.href;
    const shareData = {
      title: 'Sri Lanka Express Bus Boarding Pass',
      text: `Boarding Pass #${displayRef} - ${trip?.routeSnapshot?.startCity || 'Origin'} to ${trip?.routeSnapshot?.endCity || 'Destination'}`,
      url: shareUrl
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // Fallback to clipboard if dismissed or unhandled
      }
    }
    handleCopyReference(shareUrl);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 2500);
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const displayRef = booking?.bookingReference || booking?.id || '';

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-700 font-bold text-base">Retrieving your official E-Boarding Pass...</p>
        <p className="text-slate-400 text-xs mt-1">Verifying encrypted digital ticket signature</p>
      </div>
    );
  }

  // Secure Verification Challenge: Prevent Enumeration / ID Guessing
  if (needsPhoneVerification) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <div className="p-8 text-center bg-white border border-slate-200 rounded-3xl shadow-xl">
          <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">{t('phoneVerificationRequired')}</h2>
          <p className="text-slate-500 text-xs mb-6 leading-relaxed">
            {t('phoneVerificationDesc')}
          </p>

          {verifyError && (
            <div className="mb-4 p-3.5 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200 flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          <form onSubmit={handlePhoneVerifySubmit} className="space-y-4">
            <div>
              <input
                type="tel"
                required
                placeholder={t('verifyPhonePlaceholder')}
                value={verifyPhoneInput}
                onChange={e => setVerifyPhoneInput(e.target.value)}
                className="w-full p-3.5 border border-slate-300 rounded-xl text-center font-mono font-bold text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer text-sm"
            >
              {t('verifyAndView')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <div className="p-8 text-center bg-white border border-slate-200 rounded-3xl shadow-xl">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-2">{t('bookingNotFound')}</h2>
          <p className="text-slate-500 text-xs mb-6 leading-relaxed">
            {t('bookingNotFoundDesc', { ref: bookingId as string })}
          </p>
          <button 
            onClick={() => router.push('/')} 
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition shadow-md cursor-pointer text-sm"
          >
            {t('goHome')}
          </button>
        </div>
      </div>
    );
  }

  const passengerName = booking.passengerDetails?.name || booking.passengerName || 'Passenger';
  const passengerPhone = booking.passengerDetails?.phone || booking.passengerPhone || '';
  const totalAmount = booking.fares?.ticketAmount || booking.totalAmount || 0;
  const isConfirmed = (booking.status || '').toLowerCase() === 'confirmed';
  const isBoarded = (booking.status || '').toLowerCase() === 'boarded' || booking.boarded;
  const isCancelled = (booking.status || '').toLowerCase() === 'cancelled';
  const isGuest = booking.bookingType === 'guest';
  const busRegNumber = trip?.busSnapshot?.regNumber || booking.tripSnapshot?.busSnapshot?.regNumber || '';
  const busName = trip?.busSnapshot?.name || booking.tripSnapshot?.busSnapshot?.name || 'Express Coach';
  const busType = trip?.busSnapshot?.type || booking.tripSnapshot?.busSnapshot?.type || 'Super Luxury AC';
  const startCity = trip?.routeSnapshot?.startCity || booking.tripSnapshot?.routeSnapshot?.startCity || 'Origin';
  const endCity = trip?.routeSnapshot?.endCity || booking.tripSnapshot?.routeSnapshot?.endCity || 'Destination';
  const departureDate = trip?.departureDate || booking.tripSnapshot?.departureDate || '';
  const departureTime = trip?.departureTime || booking.tripSnapshot?.departureTime || '';
  const arrivalTime = trip?.arrivalTime || booking.tripSnapshot?.arrivalTime || '';
  const duration = trip?.duration || booking.tripSnapshot?.duration || '';

  return (
    <div className="max-w-3xl mx-auto my-8 px-4 sm:px-6">
      
      {/* Top Banner & Guest Claim Notice */}
      {isGuest && showAccountPrompt && (
        <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs print:hidden">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-orange-500 text-white rounded-xl mt-0.5 shrink-0 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">
                {t('manageEasier')}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('manageEasierDesc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            {user ? (
              <button
                onClick={handleLinkToMyAccount}
                disabled={linking}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {linking ? t('linking') : t('linkToMyAccount')}
              </button>
            ) : (
              <Link
                href={`/register?redirect=/ticket/${booking.id}`}
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs inline-block text-center"
              >
                {t('createAccount')}
              </Link>
            )}
            <button
              onClick={() => setShowAccountPrompt(false)}
              className="p-1.5 text-slate-400 hover:text-slate-600 text-xs rounded-lg transition cursor-pointer"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {linkSuccessNotice && (
        <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 shadow-2xs print:hidden">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{linkSuccessNotice}</span>
        </div>
      )}

      {/* Main Boarding Pass Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden print:shadow-none print:border-2 print:border-slate-800 print:rounded-2xl relative">
        
        {/* Top Header Strip */}
        <div className="bg-slate-900 text-white px-6 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center font-black text-white text-sm shadow-xs">
              LK
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-orange-400 block">
                Official Boarding Pass
              </span>
              <span className="text-sm font-black text-white">
                Sri Lanka Intercity Express Network
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 text-xs font-black rounded-full uppercase tracking-wider ${
              isBoarded 
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' 
                : isConfirmed 
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                : isCancelled
                ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}>
              {isBoarded ? 'BOARDED' : isCancelled ? 'CANCELLED' : isConfirmed ? 'CONFIRMED' : booking.status}
            </span>

            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
              {isGuest ? 'GUEST PASS' : 'VERIFIED PASS'}
            </span>
          </div>
        </div>

        {/* Boarding Pass Body: Responsive Grid with Perforation */}
        <div className="flex flex-col md:flex-row relative">
          
          {/* Main Stub (Left on desktop) */}
          <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
            <div>
              {/* Route Origin &rarr; Destination Hero */}
              <div className="pb-6 mb-6 border-b border-slate-100">
                <div className="flex items-center justify-between text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">
                  <span>Departure Terminal</span>
                  <span className="flex items-center gap-1 text-orange-600">
                    <BusIcon className="w-3.5 h-3.5" />
                    <span>Direct Express</span>
                  </span>
                  <span>Arrival Terminal</span>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {startCity}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">Central Bus Stand</p>
                  </div>

                  <div className="flex flex-col items-center px-2">
                    <div className="w-8 h-8 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                    {duration && (
                      <span className="text-[10px] font-bold text-slate-400 mt-1 whitespace-nowrap">
                        {duration}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 text-right">
                    <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {endCity}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 mt-0.5">Main Bus Stand</p>
                  </div>
                </div>
              </div>

              {/* Journey & Vehicle Spec Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-5 gap-x-4 mb-6">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-orange-500" /> Date
                  </span>
                  <p className="font-bold text-slate-800 text-sm mt-1">{departureDate}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-orange-500" /> Departure Time
                  </span>
                  <p className="font-bold text-orange-600 text-sm mt-1">
                    {departureTime}
                    {arrivalTime && <span className="text-xs font-normal text-slate-400"> (Arr: {arrivalTime})</span>}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Coach Plate</span>
                  <div className="mt-1">
                    {busRegNumber ? (
                      <span className="inline-block font-mono text-[11px] font-black tracking-wider bg-amber-300 text-slate-950 px-2 py-0.5 rounded border border-slate-900 shadow-2xs select-none">
                        {busRegNumber}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-600">Express Fleet</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <UserIcon className="w-3 h-3" /> Passenger
                  </span>
                  <p className="font-bold text-slate-800 text-sm mt-1 truncate">{passengerName}</p>
                  {passengerPhone && (
                    <p className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                      <Phone className="w-2.5 h-2.5" /> {passengerPhone}
                    </p>
                  )}
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bus Model</span>
                  <p className="font-semibold text-slate-800 text-xs mt-1 truncate">{busName}</p>
                  <p className="text-[11px] text-slate-400">{busType}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Seats</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(booking.seats || []).map((s: string) => (
                      <span key={s} className="px-2.5 py-0.5 bg-orange-600 text-white font-black text-xs rounded-md shadow-2xs">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Boarding Notice & Instructions */}
            <div className="pt-4 border-t border-slate-100 flex items-start gap-2.5 text-slate-500 text-xs bg-slate-50 p-3.5 rounded-2xl">
              <Info className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                <strong>Boarding Notice:</strong> Please report to the departure halt 15 minutes before departure. Conductor will scan the digital QR code on this ticket. Carry your National Identity Card (NIC) or Passport.
              </p>
            </div>
          </div>

          {/* Perforated Divider (Hidden on print, notches on desktop) */}
          <div className="relative border-t md:border-t-0 md:border-l border-dashed border-slate-300 md:my-0 flex items-center justify-center">
            {/* Desktop Notches */}
            <div className="hidden md:block absolute -top-4 -left-4 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 shadow-inner z-10 print:hidden"></div>
            <div className="hidden md:block absolute -bottom-4 -left-4 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 shadow-inner z-10 print:hidden"></div>
            
            {/* Mobile Notches */}
            <div className="md:hidden absolute -top-4 -left-4 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 shadow-inner z-10 print:hidden"></div>
            <div className="md:hidden absolute -top-4 -right-4 w-8 h-8 rounded-full bg-slate-50 border border-slate-200 shadow-inner z-10 print:hidden"></div>
          </div>

          {/* Right Stub: QR Code & Security Stamp */}
          <div className="bg-slate-50/70 p-6 sm:p-8 md:w-64 shrink-0 flex flex-col items-center justify-between text-center border-t md:border-t-0 border-slate-100 print:bg-white">
            <div className="flex flex-col items-center w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                {t('eTicketPass')}
              </span>

              {/* QR Code Container */}
              <div className="bg-white p-3.5 rounded-2xl shadow-md border border-slate-200 mb-3.5 print:shadow-none print:border-slate-800">
                <QRCodeSVG value={displayRef} size={135} level="H" />
              </div>

              {/* Booking Reference with Quick Copy */}
              <div className="w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Reference No.
                </span>
                <div className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs w-full">
                  <span className="font-mono text-xs font-black tracking-wider text-slate-800 truncate">
                    {displayRef}
                  </span>
                  <button
                    onClick={() => handleCopyReference(displayRef)}
                    className="text-slate-400 hover:text-orange-600 transition p-1 cursor-pointer print:hidden"
                    title="Copy Reference"
                  >
                    {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                {t('showQR')}
              </p>
            </div>

            {/* Price Badge */}
            <div className="w-full mt-6 pt-4 border-t border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {t('totalPaid')}
              </span>
              <span className="text-xl font-black text-slate-900 block mt-0.5">
                Rs. {Number(totalAmount).toFixed(2)}
              </span>
              {booking.seats && booking.seats.length > 0 && (
                <span className="text-[10px] text-slate-400">
                  Rs. {(Number(totalAmount) / booking.seats.length).toFixed(2)} &times; {booking.seats.length} seat(s)
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons: Print, Share, Navigation */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-8 print:hidden">
        <button
          onClick={handleDownloadPDF}
          className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-3.5 rounded-xl shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer text-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Print / Save Ticket</span>
        </button>

        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-3.5 rounded-xl border border-slate-300 shadow-2xs hover:shadow transition active:scale-95 cursor-pointer text-sm"
        >
          {shareSuccess ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4 text-orange-600" />}
          <span>{shareSuccess ? 'Link Copied!' : 'Share Pass'}</span>
        </button>

        <button
          onClick={() => router.push('/bookings')}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-3.5 rounded-xl border border-slate-300 shadow-2xs hover:shadow transition active:scale-95 cursor-pointer text-sm"
        >
          <TicketIcon className="w-4 h-4 text-slate-500" />
          <span>My Bookings</span>
        </button>

        <button
          onClick={() => router.push('/')}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-3.5 rounded-xl border border-slate-300 shadow-2xs hover:shadow transition active:scale-95 cursor-pointer text-sm"
        >
          <Home className="w-4 h-4 text-slate-500" />
          <span>{t('goHome')}</span>
        </button>
      </div>
    </div>
  );
}
