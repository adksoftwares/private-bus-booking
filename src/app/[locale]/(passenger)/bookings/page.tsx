"use client";

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { 
  Search, 
  Link as LinkIcon, 
  KeyRound, 
  LogIn, 
  Calendar, 
  Clock, 
  ArrowRight, 
  Plus, 
  Ticket as TicketIcon,
  AlertCircle,
  CheckCircle2,
  X,
  Bus as BusIcon,
  Phone
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PassengerBookingsPage() {
  const { user, loading: authLoading, authFetch } = useAuth();
  const router = useRouter();
  const t = useTranslations('myBookings');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Guest lookup state
  const [guestRefInput, setGuestRefInput] = useState('');
  const [guestPhoneInput, setGuestPhoneInput] = useState('');
  const [guestLookupError, setGuestLookupError] = useState('');

  // Account linking modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkRefInput, setLinkRefInput] = useState('');
  const [linkPhoneInput, setLinkPhoneInput] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkModalError, setLinkModalError] = useState('');

  const loadUserBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await authFetch('/api/bookings/user');
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings || []);
      } else {
        setBookings([]);
      }
    } catch (err) {
      console.error("Failed to load user bookings:", err);
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    let isMounted = true;
    if (!user?.uid) {
      return;
    }

    const load = async () => {
      await Promise.resolve();
      if (!isMounted) return;
      await loadUserBookings();
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [user?.uid, loadUserBookings]);

  const handleGuestLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setGuestLookupError('');
    const cleanRef = guestRefInput.trim();
    if (!cleanRef) {
      setGuestLookupError("Please enter your Booking Reference or Order ID.");
      return;
    }
    if (!guestPhoneInput.trim()) {
      setGuestLookupError("Please enter the passenger phone number used at checkout.");
      return;
    }
    router.push(`/ticket/${encodeURIComponent(cleanRef)}`);
  };

  const handleLinkGuestBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLinkModalError('');
    setLinking(true);

    try {
      const res = await authFetch('/api/bookings/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: linkRefInput.trim(),
          phone: linkPhoneInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link booking');
      }

      setNotice({ type: 'success', message: data.message || 'Booking successfully linked to your account!' });
      setShowLinkModal(false);
      setLinkRefInput('');
      setLinkPhoneInput('');
      // Reload bookings
      loadUserBookings();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to link booking';
      setLinkModalError(msg);
    } finally {
      setLinking(false);
    }
  };

  const handleCancel = async (booking: Booking) => {
    if (!user) return;
    const confirmPrompt = window.confirm(
      `Are you sure you want to cancel booking #${booking.bookingReference || booking.id}?\n\nRefund Policy:\n• More than 24 hours before departure: 100% refund\n• 12 to 24 hours before departure: 50% refund\n• Less than 12 hours: No refund\n\nSeats will be released immediately.`
    );
    if (!confirmPrompt) return;

    setCancellingId(booking.id);
    setNotice(null);

    try {
      const response = await authFetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel booking');
      }

      setNotice({ type: 'success', message: data.message });
      
      // Update local state
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'cancelled' } : b));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancellation failed. Please try again.';
      setNotice({ type: 'error', message });
    } finally {
      setCancellingId(null);
    }
  };

  if (authLoading || (user && bookingsLoading)) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-700 font-bold text-base">Loading your booking history...</p>
        <p className="text-slate-400 text-xs mt-1">Retrieving confirmed reservations</p>
      </div>
    );
  }

  // If user is not logged in: Present Guest Booking Lookup & Sign-in CTA
  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-4 py-12">
        <div className="bg-white p-6 sm:p-10 border border-slate-200 rounded-3xl shadow-xl">
          <div className="text-center mb-8">
            <div className="w-14 h-14 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-2xs">
              <KeyRound className="w-7 h-7" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{t('findTicket')}</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1.5 max-w-sm mx-auto leading-relaxed">
              {t('guestLookupDesc')}
            </p>
          </div>

          {guestLookupError && (
            <div className="p-3.5 mb-6 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{guestLookupError}</span>
            </div>
          )}

          <form onSubmit={handleGuestLookup} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Booking Reference or Order ID *
              </label>
              <input 
                type="text"
                required
                placeholder={t('referencePlaceholder')}
                value={guestRefInput}
                onChange={e => setGuestRefInput(e.target.value)}
                className="w-full p-3.5 border border-slate-300 rounded-xl font-mono text-sm uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Found in your booking confirmation SMS or receipt (e.g. SLB-7K9M-3P2W)
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Passenger Phone Number *
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="tel"
                  required
                  placeholder={t('phonePlaceholder')}
                  value={guestPhoneInput}
                  onChange={e => setGuestPhoneInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-3.5 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg active:scale-95 cursor-pointer flex items-center justify-center gap-2 text-sm mt-2"
            >
              <Search className="w-4 h-4" />
              <span>{t('findViewTicket')}</span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 mb-3">{t('haveAccount')}</p>
            <Link
              href="/login?redirect=/bookings"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-2xs"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to View All Account Bookings</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const confirmedCount = bookings.filter(b => b.status === 'confirmed' || b.status === 'boarded').length;
  const cancelledCount = bookings.filter(b => b.status === 'cancelled').length;

  const filteredBookings = bookings.filter(b => {
    if (filterTab === 'all') return true;
    if (filterTab === 'confirmed') return b.status === 'confirmed' || b.status === 'boarded';
    if (filterTab === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 py-8 sm:py-10">
      
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">{t('title')}</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowLinkModal(true)}
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-2xs cursor-pointer"
          >
            <LinkIcon className="w-3.5 h-3.5 text-orange-600" />
            <span>{t('linkPastBooking')}</span>
          </button>
          <Link 
            href="/" 
            className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm hover:shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('bookNewTrip')}</span>
          </Link>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-2xl mb-6 text-xs sm:text-sm font-semibold border flex items-center justify-between shadow-2xs ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
            <span>{notice.message}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account Linking Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white max-w-md w-full p-6 sm:p-8 rounded-3xl shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-orange-600" />
                {t('linkModalTitle')}
              </h3>
              <button 
                onClick={() => setShowLinkModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              {t('linkModalDesc')}
            </p>

            {linkModalError && (
              <div className="p-3 mb-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{linkModalError}</span>
              </div>
            )}

            <form onSubmit={handleLinkGuestBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Booking Reference or ID *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. SLB-7K9M-3P2W"
                  value={linkRefInput}
                  onChange={e => setLinkRefInput(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm uppercase tracking-wider outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Passenger Mobile Phone *
                </label>
                <input 
                  type="tel"
                  required
                  placeholder={t('phonePlaceholder')}
                  value={linkPhoneInput}
                  onChange={e => setLinkPhoneInput(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer transition"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={linking}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {linking ? 'Linking...' : t('linkNow')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Segmented Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'all' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabAll')} ({bookings.length})
        </button>
        <button
          onClick={() => setFilterTab('confirmed')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'confirmed' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabConfirmed')} ({confirmedCount})
        </button>
        <button
          onClick={() => setFilterTab('cancelled')}
          className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${filterTab === 'cancelled' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabCancelled')} ({cancelledCount})
        </button>
      </div>
      
      {/* Booking List */}
      {filteredBookings.length === 0 ? (
        <div className="p-16 text-center bg-white border border-slate-200 rounded-3xl shadow-xs">
          <div className="w-14 h-14 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl shadow-2xs">
            <TicketIcon className="w-7 h-7" />
          </div>
          <p className="text-slate-800 font-black text-lg mb-1">{t('emptyTitle')}</p>
          <p className="text-slate-400 text-xs sm:text-sm mb-6 max-w-sm mx-auto">{t('emptyDesc')}</p>
          <button 
            onClick={() => router.push('/')} 
            className="bg-orange-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-orange-700 transition cursor-pointer text-sm shadow-md"
          >
            {t('bookNewTrip')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:gap-5">
          {filteredBookings.map((booking) => {
            const isConfirmed = booking.status === 'confirmed';
            const isBoarded = booking.status === 'boarded' || booking.boarded;
            const isCancelled = booking.status === 'cancelled';
            const displayRef = booking.bookingReference || booking.id;
            const busRegNumber = booking.tripSnapshot?.busSnapshot?.regNumber;

            return (
              <div 
                key={booking.id} 
                className="bg-white p-5 sm:p-6 border border-slate-200/90 rounded-3xl shadow-xs hover:shadow-md transition flex flex-col md:flex-row justify-between md:items-center gap-6"
              >
                <div className="flex-1">
                  {/* Top Meta Chips */}
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
                      {displayRef}
                    </span>
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full uppercase tracking-wider ${
                      isBoarded 
                        ? 'bg-purple-100 text-purple-700' 
                        : isConfirmed 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : isCancelled 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {isBoarded ? 'BOARDED' : booking.status}
                    </span>
                    {booking.bookingType === 'guest' && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                        Guest
                      </span>
                    )}
                    {busRegNumber && (
                      <span className="font-mono text-[10px] font-black bg-amber-300 text-slate-950 px-2 py-0.5 rounded border border-slate-900 shadow-2xs select-none">
                        {busRegNumber}
                      </span>
                    )}
                  </div>

                  {/* Route Origin &rarr; Destination */}
                  <div className="flex items-center gap-2 font-black text-lg text-slate-800 mb-1">
                    <span>{booking.tripSnapshot?.routeSnapshot?.startCity || 'Origin'}</span>
                    <ArrowRight className="w-4 h-4 text-orange-500" />
                    <span>{booking.tripSnapshot?.routeSnapshot?.endCity || 'Destination'}</span>
                  </div>

                  {/* Bus & Schedule info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3 font-medium">
                    <span className="flex items-center gap-1 text-slate-700 font-semibold">
                      <BusIcon className="w-3.5 h-3.5 text-orange-600" />
                      {booking.tripSnapshot?.busSnapshot?.name || 'Express Bus'}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1 text-slate-700">
                      <Calendar className="w-3.5 h-3.5 text-orange-500" />
                      {booking.tripSnapshot?.departureDate}
                    </span>
                    <span>&bull;</span>
                    <span className="flex items-center gap-1 text-slate-700">
                      <Clock className="w-3.5 h-3.5 text-orange-500" />
                      {booking.tripSnapshot?.departureTime}
                    </span>
                  </div>

                  {/* Seats, Passenger, Fare Details */}
                  <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-medium">Seats:</span>
                      <div className="flex gap-1">
                        {(booking.seats || []).map((s: string) => (
                          <span key={s} className="px-1.5 py-0.5 bg-orange-100 text-orange-700 font-black rounded text-[11px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span>&bull;</span>
                    <div>
                      <span className="text-slate-400 font-medium">Passenger: </span>
                      <strong className="text-slate-700">{booking.passengerName}</strong>
                    </div>
                    <span>&bull;</span>
                    <div>
                      <span className="text-slate-400 font-medium">Total: </span>
                      <strong className="text-slate-900 font-bold">Rs. {Number(booking.totalAmount).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-center gap-2.5 border-t md:border-t-0 pt-4 md:pt-0">
                  <button 
                    onClick={() => router.push(`/ticket/${booking.id}`)}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl transition font-bold text-xs sm:text-sm cursor-pointer shadow-xs hover:shadow"
                  >
                    {t('viewETicket')}
                  </button>
                  
                  {isConfirmed && !isBoarded && (
                    <button 
                      onClick={() => handleCancel(booking)}
                      disabled={cancellingId === booking.id}
                      className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl transition font-semibold text-xs sm:text-sm cursor-pointer disabled:opacity-50"
                    >
                      {cancellingId === booking.id ? 'Processing...' : t('cancel')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
