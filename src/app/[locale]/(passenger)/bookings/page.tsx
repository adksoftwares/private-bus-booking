"use client";

import { useEffect, useState } from 'react';
import { ref, get, child } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, Link } from '@/i18n/routing';
import { Booking } from '@/types/booking';
import { Search, Link as LinkIcon, KeyRound, LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PassengerBookingsPage() {
  const { user, loading: authLoading } = useAuth();
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

  const loadUserBookings = async (uid: string) => {
    setBookingsLoading(true);
    try {
      const userBookingsRef = ref(db, `indexes/userBookings/${uid}`);
      const snapshot = await get(userBookingsRef);
      
      if (snapshot.exists()) {
        const bookingIds = Object.keys(snapshot.val());
        const bookingPromises = bookingIds.map(id => get(child(ref(db), `bookings/${id}`)));
        const bookingSnapshots = await Promise.all(bookingPromises);
        
        const bookingData: Booking[] = bookingSnapshots
          .filter(s => s.exists())
          .map(snap => ({ id: snap.key as string, ...snap.val() }));
          
        // Sort by newest first
        bookingData.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setBookings(bookingData);
      } else {
        setBookings([]);
      }
    } catch (err) {
      console.error("Failed to load user bookings:", err);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    if (!user?.uid) {
      return;
    }

    const load = async () => {
      await Promise.resolve();
      if (!isMounted) return;
      await loadUserBookings(user.uid);
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

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
      const res = await fetch('/api/bookings/link-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: linkRefInput.trim(),
          userId: user.uid,
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
      loadUserBookings(user.uid);
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
      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          userId: user.uid
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
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Loading your booking history...</p>
      </div>
    );
  }

  // If user is not logged in: Present Guest Booking Lookup & Sign-in CTA
  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-4 py-12">
        <div className="bg-white p-8 border border-slate-200 rounded-3xl shadow-xl">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <KeyRound className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-slate-800">{t('findTicket')}</h1>
            <p className="text-slate-500 text-xs mt-1">
              {t('guestLookupDesc')}
            </p>
          </div>

          {guestLookupError && (
            <div className="p-3 mb-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-xl">
              {guestLookupError}
            </div>
          )}

          <form onSubmit={handleGuestLookup} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Booking Reference or Order ID *
              </label>
              <input 
                type="text"
                required
                placeholder={t('referencePlaceholder')}
                value={guestRefInput}
                onChange={e => setGuestRefInput(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200 uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                Passenger Phone Number *
              </label>
              <input 
                type="tel"
                required
                placeholder={t('phonePlaceholder')}
                value={guestPhoneInput}
                onChange={e => setGuestPhoneInput(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              <Search className="w-4 h-4" />
              <span>{t('findViewTicket')}</span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-slate-100 text-center">
            <p className="text-xs text-slate-500 mb-3">{t('haveAccount')}</p>
            <Link
              href="/login?redirect=/bookings"
              className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-5 py-2.5 rounded-xl transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to View All Account Bookings</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredBookings = bookings.filter(b => {
    if (filterTab === 'all') return true;
    if (filterTab === 'confirmed') return b.status === 'confirmed' || b.status === 'boarded';
    if (filterTab === 'cancelled') return b.status === 'cancelled';
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto p-4 py-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-800">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('subtitle')}</p>
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
            className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-sm"
          >
            <span>+</span> {t('bookNewTrip')}
          </Link>
        </div>
      </div>

      {notice && (
        <div className={`p-4 rounded-xl mb-6 text-sm font-medium border flex items-center justify-between ${notice.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} className="text-xs font-bold cursor-pointer">✕</button>
        </div>
      )}

      {/* Account Linking Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl shadow-2xl border border-slate-200">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-orange-600" />
                {t('linkModalTitle')}
              </h3>
              <button 
                onClick={() => setShowLinkModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              {t('linkModalDesc')}
            </p>

            {linkModalError && (
              <div className="p-3 mb-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-xl">
                {linkModalError}
              </div>
            )}

            <form onSubmit={handleLinkGuestBooking} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Booking Reference or ID *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="e.g. SLB-7K9M-3P2W"
                  value={linkRefInput}
                  onChange={e => setLinkRefInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Passenger Mobile Phone *
                </label>
                <input 
                  type="tel"
                  required
                  placeholder={t('phonePlaceholder')}
                  value={linkPhoneInput}
                  onChange={e => setLinkPhoneInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl font-mono text-sm outline-none focus:border-orange-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={linking}
                  className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {linking ? 'Linking...' : t('linkNow')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer ${filterTab === 'all' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabAll')} ({bookings.length})
        </button>
        <button
          onClick={() => setFilterTab('confirmed')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer ${filterTab === 'confirmed' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabConfirmed')} ({bookings.filter(b => b.status === 'confirmed' || b.status === 'boarded').length})
        </button>
        <button
          onClick={() => setFilterTab('cancelled')}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition cursor-pointer ${filterTab === 'cancelled' ? 'bg-orange-100 text-orange-700' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {t('tabCancelled')} ({bookings.filter(b => b.status === 'cancelled').length})
        </button>
      </div>
      
      {filteredBookings.length === 0 ? (
        <div className="p-16 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
            🎫
          </div>
          <p className="text-slate-700 font-bold text-lg mb-1">{t('emptyTitle')}</p>
          <p className="text-slate-400 text-sm mb-6">{t('emptyDesc')}</p>
          <button 
            onClick={() => router.push('/')} 
            className="bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-orange-700 transition cursor-pointer"
          >
            {t('bookNewTrip')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {filteredBookings.map((booking) => {
            const isConfirmed = booking.status === 'confirmed';
            const isBoarded = booking.status === 'boarded' || booking.boarded;
            const isCancelled = booking.status === 'cancelled';
            const displayRef = booking.bookingReference || booking.id;

            return (
              <div 
                key={booking.id} 
                className="bg-white p-6 border border-slate-200 rounded-3xl shadow-sm hover:shadow-md transition flex flex-col md:flex-row justify-between md:items-center gap-6"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
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
                  </div>

                  <h3 className="text-lg font-bold text-slate-800 mb-1">
                    {booking.tripSnapshot?.routeSnapshot?.startCity || 'Origin'} &rarr; {booking.tripSnapshot?.routeSnapshot?.endCity || 'Destination'}
                  </h3>

                  <p className="text-sm text-slate-500 mb-3">
                    {booking.tripSnapshot?.busSnapshot?.name || 'Express Bus'} • {booking.tripSnapshot?.departureDate} at {booking.tripSnapshot?.departureTime}
                  </p>

                  <div className="flex flex-wrap gap-y-1 gap-x-4 text-xs text-slate-600">
                    <span><strong>Seats:</strong> {booking.seats?.join(', ')}</span>
                    <span>•</span>
                    <span><strong>Passenger:</strong> {booking.passengerName}</span>
                    <span>•</span>
                    <span><strong>Total:</strong> Rs. {Number(booking.totalAmount).toFixed(2)}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 border-t md:border-t-0 pt-4 md:pt-0">
                  <button 
                    onClick={() => router.push(`/ticket/${booking.id}`)}
                    className="px-5 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl transition font-bold text-sm cursor-pointer"
                  >
                    {t('viewETicket')}
                  </button>
                  
                  {isConfirmed && !isBoarded && (
                    <button 
                      onClick={() => handleCancel(booking)}
                      disabled={cancellingId === booking.id}
                      className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl transition font-semibold text-sm cursor-pointer disabled:opacity-50"
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
