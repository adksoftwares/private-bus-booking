"use client";

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter, Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { Trip } from '@/types/trip';
import { Download, Home, Ticket as TicketIcon, Sparkles, ShieldCheck, KeyRound } from 'lucide-react';
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

  const handleDownloadPDF = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Loading your official E-Ticket...</p>
      </div>
    );
  }

  // Secure Verification Challenge: Prevent Enumeration / ID Guessing
  if (needsPhoneVerification) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-white border border-slate-200 rounded-3xl shadow-xl">
        <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <KeyRound className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t('phoneVerificationRequired')}</h2>
        <p className="text-slate-500 text-xs mb-6">
          {t('phoneVerificationDesc')}
        </p>

        {verifyError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-xl border border-red-200">
            {verifyError}
          </div>
        )}

        <form onSubmit={handlePhoneVerifySubmit} className="space-y-3">
          <input
            type="tel"
            required
            placeholder={t('verifyPhonePlaceholder')}
            value={verifyPhoneInput}
            onChange={e => setVerifyPhoneInput(e.target.value)}
            className="w-full p-3 border border-slate-300 rounded-xl text-center font-mono font-bold text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
          />
          <button
            type="submit"
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl transition shadow-md cursor-pointer text-sm"
          >
            {t('verifyAndView')}
          </button>
        </form>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-white border border-red-200 rounded-2xl shadow-sm">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{t('bookingNotFound')}</h2>
        <p className="text-slate-500 text-sm mb-6">
          {t('bookingNotFoundDesc', { ref: bookingId as string })}
        </p>
        <button 
          onClick={() => router.push('/')} 
          className="inline-block bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-orange-700 transition"
        >
          {t('goHome')}
        </button>
      </div>
    );
  }

  const passengerName = booking.passengerDetails?.name || booking.passengerName || 'Passenger';
  const passengerPhone = booking.passengerDetails?.phone || booking.passengerPhone || '';
  const totalAmount = booking.fares?.ticketAmount || booking.totalAmount || 0;
  const isConfirmed = (booking.status || '').toLowerCase() === 'confirmed';
  const isBoarded = (booking.status || '').toLowerCase() === 'boarded' || booking.boarded;
  const isGuest = booking.bookingType === 'guest';
  const displayRef = booking.bookingReference || booking.id;

  return (
    <div className="max-w-2xl mx-auto my-10 px-4">
      {/* Optional Account Creation Card for Guest Bookings */}
      {isGuest && showAccountPrompt && (
        <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border border-orange-200 rounded-3xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs print:hidden">
          <div className="flex items-start gap-2.5">
            <div className="p-2 bg-orange-500 text-white rounded-xl mt-0.5 shrink-0">
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
                className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer"
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
        <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{linkSuccessNotice}</span>
        </div>
      )}

      {/* Printable E-Ticket Card */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden flex flex-col md:flex-row print:shadow-none print:border print:rounded-none">
        
        {/* Left side: QR Code & Verification Stamp */}
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-8 flex flex-col items-center justify-center md:w-5/12 text-center print:bg-orange-600">
          <span className="bg-white/20 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase mb-4">
            {t('eTicketPass')}
          </span>
          <div className="bg-white p-3 rounded-2xl shadow-md mb-4">
            <QRCodeSVG value={displayRef} size={135} />
          </div>
          <p className="font-mono text-sm font-black tracking-wider text-white bg-black/20 px-3 py-1 rounded-lg">
            {displayRef}
          </p>
          <span className="text-[10px] text-orange-100 uppercase tracking-widest mt-1">
            {isGuest ? 'Guest Booking Pass' : 'Account Booking Pass'}
          </span>
          <p className="text-xs mt-3 text-orange-100 opacity-90 leading-relaxed max-w-[200px]">
            {t('showQR')}
          </p>
        </div>

        {/* Right side: Trip & Passenger Details */}
        <div className="p-8 md:w-7/12 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-100">
              <div>
                <h1 className="text-xl font-black text-slate-800">
                  {trip?.routeSnapshot?.startCity || booking.tripSnapshot?.routeSnapshot?.startCity || 'Departure'} &rarr; {trip?.routeSnapshot?.endCity || booking.tripSnapshot?.routeSnapshot?.endCity || 'Destination'}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 font-semibold">
                  {trip?.busSnapshot?.name || booking.tripSnapshot?.busSnapshot?.name || 'Express Bus'} ({trip?.busSnapshot?.type || booking.tripSnapshot?.busSnapshot?.type || 'Standard'})
                  <span className="block font-mono text-[11px] text-slate-400 mt-0.5">{trip?.busSnapshot?.regNumber || booking.tripSnapshot?.busSnapshot?.regNumber}</span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                  isBoarded 
                    ? 'bg-purple-100 text-purple-700' 
                    : isConfirmed 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {isBoarded ? 'BOARDED' : booking.status || 'Confirmed'}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isGuest ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'
                }`}>
                  {isGuest ? 'Guest Booking' : 'Verified Account'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-4 gap-x-6 mb-6">
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Date</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5">
                  {trip?.departureDate || booking.tripSnapshot?.departureDate || 'Scheduled'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Departure</p>
                <p className="font-bold text-orange-600 text-sm mt-0.5">
                  {trip?.departureTime || booking.tripSnapshot?.departureTime || 'Scheduled'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Passenger</p>
                <p className="font-bold text-slate-800 text-sm mt-0.5 truncate">{passengerName}</p>
                {passengerPhone && <p className="text-xs text-slate-400 font-mono">{passengerPhone}</p>}
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Seats</p>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {(booking.seats || []).map((s: string) => (
                    <span key={s} className="px-2 py-0.5 bg-orange-100 text-orange-700 font-bold text-xs rounded">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-slate-50 border border-slate-100 p-4 rounded-2xl">
            <div>
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block">{t('totalPaid')}</span>
              {booking.seats && booking.seats.length > 0 && (
                <span className="text-[11px] text-slate-400 font-medium">
                  Rs. {(Number(totalAmount) / booking.seats.length).toFixed(2)} &times; {booking.seats.length} seat(s)
                </span>
              )}
            </div>
            <span className="text-2xl font-black text-slate-800">Rs. {Number(totalAmount).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Download PDF & Navigation */}
      <div className="flex flex-wrap items-center justify-center gap-3 mt-8 print:hidden">
        <button
          onClick={handleDownloadPDF}
          className="flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 py-3 rounded-xl shadow-md hover:shadow-lg transition active:scale-95 cursor-pointer text-sm"
        >
          <Download className="w-4 h-4" />
          <span>{t('downloadPDF')}</span>
        </button>

        <button
          onClick={() => router.push('/bookings')}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-3 rounded-xl border border-slate-300 shadow-xs hover:shadow transition active:scale-95 cursor-pointer text-sm"
        >
          <TicketIcon className="w-4 h-4" />
          <span>My Bookings</span>
        </button>

        <button
          onClick={() => router.push('/')}
          className="flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-bold px-5 py-3 rounded-xl border border-slate-300 shadow-xs hover:shadow transition active:scale-95 cursor-pointer text-sm"
        >
          <Home className="w-4 h-4" />
          <span>{t('goHome')}</span>
        </button>
      </div>
    </div>
  );
}
