"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, Link } from '@/i18n/routing';
import Header from '@/components/shared/Header';
import SeatMap from '@/components/shared/SeatMap';
import { Trip } from '@/types/trip';
import { 
  ShieldCheck, 
  User, 
  LogIn, 
  Sparkles, 
  ArrowLeft, 
  Calendar, 
  Clock, 
  CreditCard,
  ArrowRight
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function BookingPage() {
  const { tripId } = useParams();
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const t = useTranslations('booking');
  
  const [trip, setTrip] = useState<Trip | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem(`trip_cache_${tripId}`);
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return null;
  });
  const [loading, setLoading] = useState(() => !trip);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const [selectedSeats, setSelectedSeats] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const pendingSeatsStr = sessionStorage.getItem('pendingSeatSelection');
      if (pendingSeatsStr) {
        try {
          const parsed = JSON.parse(pendingSeatsStr);
          if (parsed.tripId === tripId && Array.isArray(parsed.selectedSeats)) {
            sessionStorage.removeItem('pendingSeatSelection');
            return parsed.selectedSeats;
          }
        } catch (e) {
          console.error("Failed to parse pending seats:", e);
        }
      }
    }
    return [];
  });
  
  const [passengerDetails, setPassengerDetails] = useState({
    name: user?.displayName || '',
    phone: '',
    email: user?.email || ''
  });
  const [bookingMode, setBookingMode] = useState<'guest' | 'account'>(user ? 'account' : 'guest');
  const [syncedUserUid, setSyncedUserUid] = useState<string | null>(user?.uid || null);

  if (user && user.uid !== syncedUserUid) {
    setSyncedUserUid(user.uid);
    setPassengerDetails(prev => ({
      name: prev.name || user.displayName || '',
      email: prev.email || user.email || '',
      phone: prev.phone || ''
    }));
    setBookingMode('account');
  }

  useEffect(() => {
    let isMounted = true;
    if (!tripId) return;

    fetch(`/api/trips/${tripId}`)
      .then(res => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data.trip) {
          setTrip(data.trip);
          if (typeof window !== 'undefined') {
            try { sessionStorage.setItem(`trip_cache_${tripId}`, JSON.stringify(data.trip)); } catch {}
          }
        } else {
          setTrip(null);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching trip:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [tripId]);

  const individualFare = Number(trip?.farePerSeat || trip?.baseFare || 0);
  const totalAmount = selectedSeats.length * individualFare;

  const handleProceedToPayment = async () => {
    if (!trip) return;
    setErrorMsg('');

    if (selectedSeats.length === 0) {
      setErrorMsg(t('selectAtLeastOne'));
      return;
    }
    if (!passengerDetails.name.trim() || !passengerDetails.phone.trim()) {
      setErrorMsg(t('provideNamePhone'));
      return;
    }

    setSubmitting(true);

    try {
      const guestSessionId = typeof window !== 'undefined' ? sessionStorage.getItem('bus_guest_session_id') : null;

      // Authoritative Server-side Pending Booking Creation
      const response = await authFetch('/api/bookings/create-pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tripId,
          selectedSeats,
          passengerDetails: {
            name: passengerDetails.name.trim(),
            phone: passengerDetails.phone.trim(),
            email: passengerDetails.email.trim()
          },
          guestSessionId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create booking reservation');
      }

      // Store authoritative draft in session storage for payment page
      sessionStorage.setItem('bookingDraft', JSON.stringify({
        orderId: data.orderId,
        bookingReference: data.bookingReference,
        accessToken: data.accessToken,
        bookingType: data.bookingType,
        tripId,
        selectedSeats,
        passengerDetails,
        totalAmount: data.amount,
        tripSnapshot: trip
      }));

      // Cache guest ticket access token locally for device re-access
      if (typeof window !== 'undefined' && data.accessToken) {
        localStorage.setItem(`ticket_token_${data.orderId}`, data.accessToken);
        if (data.bookingReference) {
          localStorage.setItem(`ticket_token_${data.bookingReference}`, data.accessToken);
        }
      }

      router.push(`/payment?orderId=${data.orderId}&token=${data.accessToken || ''}`);
    } catch (err: unknown) {
      console.error("Booking error:", err);
      const message = err instanceof Error ? err.message : 'Failed to initiate booking reservation. Please try again.';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 font-semibold text-sm">Loading bus layout and live seat availability...</p>
        </main>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full my-16 p-8 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Trip Not Found</h2>
            <p className="text-slate-500 text-xs mb-6">
              This bus schedule is no longer active or may have completed.
            </p>
            <Link 
              href="/" 
              className="inline-block bg-orange-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-orange-700 transition text-sm"
            >
              Back to Search
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        
        {/* Navigation Breadcrumb */}
        <div className="mb-4">
          <button 
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Bus Results</span>
          </button>
        </div>

        {/* Bus Journey Header Overview Banner */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200/90 shadow-sm mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-xs font-black bg-slate-900 text-amber-300 px-2 py-0.5 rounded">
                {trip.busSnapshot?.regNumber || 'NC-8492'}
              </span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {trip.operatorName || trip.busSnapshot?.name}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              <span>{trip.routeSnapshot?.startCity}</span>
              <ArrowRight className="w-4 h-4 text-slate-400" />
              <span>{trip.routeSnapshot?.endCity}</span>
            </div>

            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 font-semibold">
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                {trip.departureDate}
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1 font-mono font-bold text-slate-800">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {trip.departureTime}
              </span>
              <span>&bull;</span>
              <span className="text-orange-600 font-bold">
                {trip.busSnapshot?.type || 'Luxury Coach'}
              </span>
            </div>
          </div>

          <div className="text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
              Individual Ticket Fare
            </span>
            <span className="text-2xl font-black text-orange-600">
              Rs. {individualFare.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-400 block">per passenger</span>
          </div>
        </div>

        {/* Main Content: Left Seat Map, Right Booking Card */}
        <div className="flex flex-col lg:flex-row items-start gap-6">
          
          {/* Left: Authentic Sri Lanka Seat Map */}
          <div className="flex-1 w-full bg-white p-5 sm:p-6 border border-slate-200/90 rounded-3xl shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  {t('selectSeats')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('reservedNotice')}
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-full self-start sm:self-auto">
                {t('maxSeats')}
              </span>
            </div>
            
            {trip.busSnapshot?.seatLayout ? (
              <SeatMap 
                tripId={tripId as string} 
                layout={trip.busSnapshot.seatLayout} 
                selectedSeats={selectedSeats}
                onSeatSelect={setSelectedSeats} 
              />
            ) : (
              <div className="text-center p-8 bg-slate-50 text-slate-500 border rounded-2xl">
                Seating layout configuration not found for this vehicle.
              </div>
            )}
          </div>

          {/* Right: Checkout Sidebar */}
          <div className="w-full lg:w-96 flex flex-col gap-6">
            
            {/* Trip Fare Summary Card */}
            <div className="bg-white p-5 sm:p-6 border border-slate-200/90 rounded-3xl shadow-sm">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
                {t('tripSummary')}
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Selected Seats ({selectedSeats.length})</span>
                  <span className="font-bold text-slate-900">
                    {selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None selected'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Ticket Price</span>
                  <span className="font-bold text-slate-900">
                    Rs. {individualFare.toFixed(2)} &times; {selectedSeats.length}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Online Service Fee</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                  <span className="text-sm font-black text-slate-800">Total Payable</span>
                  <div className="text-right">
                    <span className="text-2xl font-black text-orange-600">
                      Rs. {totalAmount.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 block font-semibold">LKR Currency</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Passenger Details & Booking Choice */}
            <div className="bg-white p-5 sm:p-6 border border-slate-200/90 rounded-3xl shadow-sm">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-4 pb-2 border-b border-slate-100">
                {t('passengerInfo')}
              </h3>

              {/* TWO 1ST-CLASS BOOKING CHOICES: Guest vs Account */}
              {!user ? (
                <div className="mb-4 grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
                  <button
                    type="button"
                    onClick={() => setBookingMode('guest')}
                    className={`p-2.5 text-left rounded-xl transition cursor-pointer text-xs ${
                      bookingMode === 'guest'
                        ? 'bg-white text-slate-900 shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <User className="w-3.5 h-3.5 text-orange-600" />
                      <span>{t('continueAsGuest')}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal block leading-tight">
                      No sign in required
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sessionStorage.setItem('pendingSeatSelection', JSON.stringify({ tripId, selectedSeats }));
                      router.push(`/login?redirect=/book/${tripId}`);
                    }}
                    className="p-2.5 text-left rounded-xl transition cursor-pointer text-xs hover:bg-slate-200/60 text-slate-600 font-bold"
                  >
                    <div className="flex items-center gap-1.5 mb-0.5 text-slate-800">
                      <LogIn className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('signInRegister')}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal block leading-tight">
                      Save to account
                    </span>
                  </button>
                </div>
              ) : (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Signed in: <strong className="font-black">{user.displayName || user.email}</strong></span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black uppercase">
                    Account
                  </span>
                </div>
              )}

              {errorMsg && (
                <div className="p-3 mb-4 text-xs font-bold bg-red-50 text-red-700 border border-red-200 rounded-xl">
                  {errorMsg}
                </div>
              )}

              {/* Passenger Inputs */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {t('fullName')} *
                  </label>
                  <input 
                    type="text" 
                    placeholder="e.g. Ruwan Perera" 
                    required 
                    className="p-3 border border-slate-300 rounded-xl w-full text-xs font-bold outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    value={passengerDetails.name} 
                    onChange={e => setPassengerDetails({...passengerDetails, name: e.target.value})}
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {t('mobilePhone')} *
                  </label>
                  <input 
                    type="tel" 
                    placeholder="0771234567" 
                    required 
                    className="p-3 border border-slate-300 rounded-xl w-full text-xs font-mono font-bold outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    value={passengerDetails.phone} 
                    onChange={e => setPassengerDetails({...passengerDetails, phone: e.target.value})}
                  />
                  <span className="text-[10.5px] text-slate-400 mt-1 block">
                    Used for your boarding SMS and guest lookup retrieval.
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    {t('email')}
                  </label>
                  <input 
                    type="email" 
                    placeholder="passenger@example.com" 
                    className="p-3 border border-slate-300 rounded-xl w-full text-xs font-medium outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                    value={passengerDetails.email} 
                    onChange={e => setPassengerDetails({...passengerDetails, email: e.target.value})}
                  />
                </div>

                {!user && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />
                    <span>
                      <strong>Guest checkout:</strong> Your ticket pass and QR code will be generated immediately after payment without needing a password.
                    </span>
                  </div>
                )}

                <button 
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={selectedSeats.length === 0 || submitting}
                  className="w-full bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black py-4 rounded-2xl transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer text-sm mt-3"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {submitting 
                      ? t('creatingReservation') 
                      : `${t('proceedToPay')} • Rs. ${totalAmount.toFixed(2)}`}
                  </span>
                </button>
              </div>

            </div>
          </div>

        </div>

      </main>
    </div>
  );
}
