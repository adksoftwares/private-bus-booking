"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/shared/Header';
import { Booking } from '@/types/booking';
import { 
  ShieldCheck, 
  Lock, 
  Bus as BusIcon, 
  Calendar, 
  Clock, 
  CreditCard, 
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function PaymentPage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlOrderId = searchParams.get('orderId');
  const t = useTranslations('payment');

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // 1. Dynamically load PayHere JavaScript SDK
    const script = document.createElement('script');
    script.src = 'https://www.payhere.lk/lib/payhere.js';
    script.async = true;
    document.body.appendChild(script);

    // 2. Resolve booking from URL parameter or Session Storage
    const loadBooking = async () => {
      try {
        let orderId = urlOrderId;
        let accessToken = searchParams.get('token') || '';
        const savedDraft = typeof window !== 'undefined' ? sessionStorage.getItem('bookingDraft') : null;
        let draftObj: any = null;

        if (savedDraft) {
          try {
            draftObj = JSON.parse(savedDraft);
            if (!orderId && draftObj.orderId) {
              orderId = draftObj.orderId;
            }
            if (!accessToken && draftObj.accessToken) {
              accessToken = draftObj.accessToken;
            }
          } catch (e) {
            console.error("Failed to parse bookingDraft:", e);
          }
        }

        if (!orderId) {
          router.push('/');
          return;
        }

        // Instant optimistic render from draft so user sees checkout card with zero spinner
        if (draftObj && (draftObj.orderId === orderId || draftObj.bookingReference === orderId)) {
          setBooking({
            id: draftObj.orderId,
            bookingReference: draftObj.bookingReference,
            accessToken: draftObj.accessToken,
            bookingType: draftObj.bookingType,
            tripId: draftObj.tripId,
            passengerName: draftObj.passengerDetails?.name || '',
            passengerPhone: draftObj.passengerDetails?.phone || '',
            passengerEmail: draftObj.passengerDetails?.email || '',
            passengerDetails: draftObj.passengerDetails,
            seats: draftObj.selectedSeats,
            totalAmount: draftObj.totalAmount,
            status: 'pending',
            tripSnapshot: draftObj.tripSnapshot
          } as unknown as Booking);
          setInitializing(false);
        }

        // Authoritative server verification
        const res = await authFetch('/api/bookings/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: orderId,
            bookingId: orderId,
            accessToken: accessToken || undefined
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data.booking) {
            setBooking(data.booking);
            setError('');
            setInitializing(false);
            return;
          }
        }

        if (!draftObj) {
          setError("Booking reservation not found or expired.");
        }
      } catch (err: unknown) {
        console.error("Error loading booking for payment:", err);
        setError("Failed to load booking details.");
      } finally {
        setInitializing(false);
      }
    };

    loadBooking();

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [urlOrderId, searchParams, router, authFetch]);

  const handlePayment = async () => {
    if (!booking) return;
    setLoading(true);
    setError('');

    try {
      let rawToken = booking.accessToken || searchParams.get('token') || '';
      if (!rawToken && typeof window !== 'undefined') {
        rawToken = localStorage.getItem(`ticket_token_${booking.id}`) || '';
        if (!rawToken && booking.bookingReference) {
          rawToken = localStorage.getItem(`ticket_token_${booking.bookingReference}`) || '';
        }
        if (!rawToken) {
          try {
            const draft = JSON.parse(sessionStorage.getItem('bookingDraft') || '{}');
            rawToken = draft.accessToken || '';
          } catch {
            // ignore
          }
        }
      }

      // 1. Request secure payment hash from our authoritative server endpoint
      const response = await authFetch('/api/payhere/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: booking.id,
          accessToken: rawToken || undefined
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to authenticate payment with gateway.');
      }

      const hashData = await response.json();
      const { hash, merchantId, formattedAmount, currency } = hashData;

      // 2. Configure PayHere official checkout payload
      const returnTokenQuery = rawToken ? `?token=${rawToken}` : '';
      const returnUrl = `${window.location.origin}/ticket/${booking.id}${returnTokenQuery}`;
      const notifyUrl = `${window.location.origin}/api/payhere/notify`;

      const paymentObj = {
        sandbox: true,
        merchant_id: merchantId,
        return_url: returnUrl,
        cancel_url: window.location.href,
        notify_url: notifyUrl,
        order_id: booking.id,
        items: `Bus Ticket(s) - ${booking.tripSnapshot?.routeSnapshot?.startCity || 'Origin'} to ${booking.tripSnapshot?.routeSnapshot?.endCity || 'Destination'}`,
        amount: formattedAmount,
        currency: currency || "LKR",
        hash: hash,
        first_name: booking.passengerName.split(' ')[0] || 'Passenger',
        last_name: booking.passengerName.split(' ').slice(1).join(' ') || '',
        email: booking.passengerEmail || user?.email || 'passenger@example.com',
        phone: booking.passengerPhone || '0770000000',
        address: "Sri Lanka",
        city: booking.tripSnapshot?.routeSnapshot?.startCity || "Colombo",
        country: "Sri Lanka",
        custom_1: booking.id
      };

      // 3. Register client event listeners on PayHere SDK
      if (typeof window !== 'undefined' && window.payhere) {
        window.payhere.onCompleted = function onCompleted() {
          sessionStorage.removeItem('bookingDraft');
          router.push(`/ticket/${booking.id}${returnTokenQuery}`);
        };

        window.payhere.onDismissed = function onDismissed() {
          setLoading(false);
        };

        window.payhere.onError = function onError(payhereError: unknown) {
          console.error("PayHere SDK error:", payhereError);
          setError(typeof payhereError === 'string' ? payhereError : 'Payment process was interrupted. Please retry.');
          setLoading(false);
        };

        window.payhere.startPayment(paymentObj);
      } else {
        throw new Error('PayHere payment gateway script failed to load. Please check your internet connection and refresh.');
      }

    } catch (err: unknown) {
      console.error("Payment initiation error:", err);
      const errorObj = err as Error;
      setError(errorObj.message || 'Payment initiation failed. Please try again.');
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-slate-600 font-semibold text-sm">Preparing secure PayHere checkout...</p>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full my-16 p-8 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Reservation Expired</h2>
            <p className="text-slate-500 text-xs mb-6">
              Your 10-minute temporary seat reservation has expired or could not be found. Please search and select your seats again.
            </p>
            <button 
              onClick={() => router.push('/')} 
              className="w-full bg-orange-600 text-white font-bold py-3 rounded-xl hover:bg-orange-700 transition text-sm cursor-pointer"
            >
              Search Buses Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const individualFare = Number(booking.tripSnapshot?.farePerSeat || booking.tripSnapshot?.baseFare || 0);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        
        {/* Top Trust Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-black uppercase tracking-wider mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>256-Bit SSL Encrypted Checkout</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t('reviewAndPay')}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative ticket reservation #<strong className="font-mono text-slate-800">{booking.bookingReference || booking.id}</strong>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs sm:text-sm font-bold flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden mb-6">
          
          {/* Order Header Banner */}
          <div className="bg-slate-900 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-orange-400 block mb-1">
                Intercity Transit Pass
              </span>
              <div className="flex items-center gap-2 text-xl font-black">
                <span>{booking.tripSnapshot?.routeSnapshot?.startCity}</span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
                <span>{booking.tripSnapshot?.routeSnapshot?.endCity}</span>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] font-bold text-slate-400 block">Total Amount</span>
              <span className="text-2xl font-black text-orange-400">
                Rs. {Number(booking.totalAmount).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Details Body */}
          <div className="p-5 sm:p-6 space-y-5 text-xs">
            
            {/* Journey Specs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Date</span>
                  <span className="font-bold text-slate-800 text-sm">{booking.tripSnapshot?.departureDate}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Departure</span>
                  <span className="font-mono font-bold text-slate-800 text-sm">{booking.tripSnapshot?.departureTime}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <BusIcon className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Bus & Coach</span>
                  <span className="font-bold text-slate-800 text-xs block">
                    {booking.tripSnapshot?.operatorName || booking.tripSnapshot?.busSnapshot?.name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {booking.tripSnapshot?.busSnapshot?.regNumber}
                  </span>
                </div>
              </div>
            </div>

            {/* Passenger & Seats Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Passenger Details
                </span>
                <div className="font-bold text-slate-900 text-sm">{booking.passengerName}</div>
                <div className="text-slate-500 font-mono text-xs">{booking.passengerPhone}</div>
                {booking.passengerEmail && (
                  <div className="text-slate-400 text-xs">{booking.passengerEmail}</div>
                )}
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Reserved Seats ({booking.seats?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {booking.seats?.map(seat => (
                    <span 
                      key={seat}
                      className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg font-mono font-black text-xs"
                    >
                      {seat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Authoritative Fare Breakdown */}
            <div className="space-y-2 pt-1">
              <div className="flex justify-between text-slate-600">
                <span>Bus Fare ({booking.seats?.length || 1} &times; Rs. {individualFare.toFixed(2)})</span>
                <span className="font-mono font-bold text-slate-900">Rs. {Number(booking.totalAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Gateway Convenience Fee</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline text-base">
                <span className="font-black text-slate-900">Grand Total Payable</span>
                <span className="text-2xl font-black text-orange-600">Rs. {Number(booking.totalAmount).toFixed(2)} LKR</span>
              </div>
            </div>

          </div>

          {/* Checkout CTA Footer */}
          <div className="bg-slate-50 p-5 sm:p-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Verified by PayHere Central Bank of Sri Lanka compliant payment system.</span>
            </div>

            <button
              onClick={handlePayment}
              disabled={loading}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 active:scale-95 text-white font-black px-8 py-4 rounded-2xl transition shadow-md hover:shadow-lg flex items-center justify-center gap-2.5 text-sm cursor-pointer disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4 stroke-[2.5]" />
              <span>{loading ? 'Connecting to PayHere...' : 'Pay Securely via PayHere'}</span>
            </button>
          </div>

        </div>

      </main>
    </div>
  );
}
