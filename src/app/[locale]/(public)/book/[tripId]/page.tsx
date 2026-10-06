"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ref, get, child } from 'firebase/database';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/routing';
import SeatMap from '@/components/shared/SeatMap';
import { Trip } from '@/types/trip';
import { ShieldCheck, User, LogIn, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function BookingPage() {
  const { tripId } = useParams();
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const t = useTranslations('booking');
  
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
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
  const [passengerDetails, setPassengerDetails] = useState({ name: '', phone: '', email: '' });
  const [bookingMode, setBookingMode] = useState<'guest' | 'account'>('guest');

  useEffect(() => {
    let isMounted = true;

    if (user) {
      // Fetch user details from RTDB and Auth
      get(child(ref(db), `users/${user.uid}`)).then((snap) => {
        if (!isMounted) return;
        setBookingMode('account');
        const phone = snap.exists() ? (snap.val().phone || snap.val().mobile || '') : '';
        setPassengerDetails(prev => ({
          ...prev,
          name: user.displayName || prev.name,
          email: user.email || prev.email,
          phone: phone || prev.phone,
        }));
      }).catch(() => {
        if (isMounted) {
          setBookingMode('account');
          setPassengerDetails(prev => ({
            ...prev,
            name: user.displayName || prev.name,
            email: user.email || prev.email,
          }));
        }
      });
    }

    const fetchTrip = async () => {
      try {
        const snap = await get(child(ref(db), `trips/${tripId}`));
        if (snap.exists() && isMounted) {
          setTrip({ id: snap.key as string, ...snap.val() });
        }
      } catch (err) {
        console.error("Failed to load trip details:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    fetchTrip();

    return () => {
      isMounted = false;
    };
  }, [tripId, user]);

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

      // Authoritative Server-side Pending Booking Creation (Supports both Guest and Account)
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
          userId: user ? user.uid : null,
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
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Loading seat map...</p>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-white border rounded-xl shadow-sm">
        <p className="text-red-500 font-bold mb-4">Trip not found or no longer scheduled.</p>
        <button onClick={() => router.push('/')} className="bg-orange-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-700">
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 flex flex-col lg:flex-row gap-8 py-8">
      {/* Left side: Seat Map */}
      <div className="flex-1 bg-white p-6 border border-slate-200 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-bold text-slate-800">Select Your Seats</h2>
          <span className="text-xs font-semibold px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full">
            Max 6 seats
          </span>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          Selected seats are temporarily reserved for 5 minutes while you complete checkout.
        </p>
        
        {trip.busSnapshot?.seatLayout ? (
          <SeatMap 
            tripId={tripId as string} 
            layout={trip.busSnapshot.seatLayout} 
            onSeatSelect={setSelectedSeats} 
          />
        ) : (
          <div className="text-center p-8 bg-slate-50 text-slate-500 border rounded-xl">
            Seat layout not configured for this bus.
          </div>
        )}
      </div>

      {/* Right side: Summary & Details */}
      <div className="w-full lg:w-96 flex flex-col gap-6">
        <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold mb-4 border-b border-slate-100 pb-2 text-slate-800">Trip Summary</h2>
          <div className="flex flex-col gap-2.5 mb-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Route</span>
              <span className="font-semibold text-slate-800">{trip.routeSnapshot?.startCity} &rarr; {trip.routeSnapshot?.endCity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Schedule</span>
              <span className="font-semibold text-slate-800">{trip.departureDate} at {trip.departureTime}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bus / Operator</span>
              <span className="font-semibold text-slate-800 text-right">
                {trip.operatorName || trip.busSnapshot?.name}
                <span className="block text-xs font-mono text-slate-500">{trip.busSnapshot?.regNumber}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bus Category</span>
              <span className="font-semibold text-slate-800">
                {trip.busSnapshot?.type} &bull; {trip.busSnapshot?.seatLayout?.type || '2x2'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Individual Fare</span>
              <span className="font-black text-orange-600 text-base">
                Rs. {Number(trip.farePerSeat || trip.baseFare).toFixed(2)}
                <span className="text-[10px] text-slate-400 font-normal block text-right">per seat</span>
              </span>
            </div>
          </div>
          
          <div className="border-t border-slate-100 pt-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500 text-sm">Selected Seats ({selectedSeats.length})</span>
              <span className="font-bold text-slate-800">{selectedSeats.length > 0 ? selectedSeats.join(', ') : 'None'}</span>
            </div>
            <div className="flex justify-between items-center text-lg mt-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              <span className="font-bold text-slate-700 text-sm">Total Fare</span>
              <span className="font-black text-orange-600 text-xl">
                Rs. {(selectedSeats.length * Number(trip.farePerSeat || trip.baseFare)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Passenger Information & Two Booking Choices */}
        <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm">
          <h2 className="text-lg font-bold mb-4 border-b border-slate-100 pb-2 text-slate-800">
            {t('passengerInfo')}
          </h2>

          {/* TWO BOOKING CHOICES: Guest vs Sign-in */}
          {!user ? (
            <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1.5 bg-slate-100 rounded-2xl">
              <button
                type="button"
                onClick={() => setBookingMode('guest')}
                className={`p-3 text-left rounded-xl transition cursor-pointer ${
                  bookingMode === 'guest'
                    ? 'bg-white text-slate-900 shadow-md ring-2 ring-orange-500'
                    : 'hover:bg-slate-200/60 text-slate-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-slate-900">
                    <User className="w-3.5 h-3.5 text-orange-500" />
                    {t('continueAsGuest')}
                  </span>
                  {bookingMode === 'guest' && (
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {t('continueAsGuestDesc')}
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem('pendingSeatSelection', JSON.stringify({ tripId, selectedSeats }));
                  router.push(`/login?redirect=/book/${tripId}`);
                }}
                className="p-3 text-left rounded-xl transition cursor-pointer hover:bg-slate-200/60 text-slate-600 bg-white/40 border border-slate-200"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs flex items-center gap-1.5 text-orange-600">
                    <LogIn className="w-3.5 h-3.5" />
                    {t('signInRegister')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  {t('signInRegisterDesc')}
                </p>
              </button>
            </div>
          ) : (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t('signedInAs')}: <strong className="font-bold">{user.displayName || user.email}</strong></span>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold uppercase shrink-0">
                {t('accountBooking')}
              </span>
            </div>
          )}
          
          {errorMsg && (
            <div className="p-3 mb-4 text-xs font-semibold bg-red-50 text-red-700 border border-red-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {t('fullName')} *
              </label>
              <input 
                type="text" 
                placeholder="e.g. Perera Silva" 
                required 
                className="p-2.5 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                value={passengerDetails.name} 
                onChange={e => setPassengerDetails({...passengerDetails, name: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {t('mobilePhone')} *
              </label>
              <input 
                type="tel" 
                placeholder="0771234567" 
                required 
                className="p-2.5 border border-slate-300 rounded-xl w-full text-sm font-mono outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                value={passengerDetails.phone} 
                onChange={e => setPassengerDetails({...passengerDetails, phone: e.target.value})}
              />
              <span className="text-[10.5px] text-slate-400 mt-0.5 block">
                Required for ticket SMS and guest retrieval verification.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                {t('email')}
              </label>
              <input 
                type="email" 
                placeholder="passenger@example.com" 
                className="p-2.5 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                value={passengerDetails.email} 
                onChange={e => setPassengerDetails({...passengerDetails, email: e.target.value})}
              />
            </div>

            {!user && (
              <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-800 flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <span>
                  <strong>{t('guestBooking')}:</strong> Your ticket will be issued immediately upon payment. You can access it anytime using your phone number or booking reference without creating an account.
                </span>
              </div>
            )}
            
            <button 
              type="button"
              onClick={handleProceedToPayment}
              disabled={selectedSeats.length === 0 || submitting}
              className="bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center cursor-pointer"
            >
              {submitting ? t('creatingReservation') : `${t('proceedToPay')} • Rs. ${(selectedSeats.length * Number(trip.farePerSeat || trip.baseFare)).toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
