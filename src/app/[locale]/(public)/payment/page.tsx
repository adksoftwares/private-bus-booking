"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { ref, get, child } from 'firebase/database';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { Booking } from '@/types/booking';

export default function PaymentPage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlOrderId = searchParams.get('orderId');

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
        if (!orderId) {
          const savedDraft = sessionStorage.getItem('bookingDraft');
          if (savedDraft) {
            try {
              const parsed = JSON.parse(savedDraft);
              orderId = parsed.orderId;
              if (!accessToken && parsed.accessToken) {
                accessToken = parsed.accessToken;
              }
            } catch (e) {
              console.error("Failed to parse bookingDraft:", e);
            }
          }
        }

        if (!orderId) {
          router.push('/');
          return;
        }

        // Try lookup endpoint first (handles guest with accessToken and account users)
        try {
          const res = await authFetch('/api/bookings/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: orderId,
              accessToken: accessToken || undefined
            })
          });

          if (res.ok) {
            const data = await res.json();
            if (data.booking) {
              setBooking(data.booking);
              setInitializing(false);
              return;
            }
          }
        } catch {
          // fallback to client database
        }

        // Fallback to client RTDB
        const bookingSnap = await get(child(ref(db), `bookings/${orderId}`));
        if (bookingSnap.exists()) {
          setBooking(bookingSnap.val());
        } else {
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
      document.body.removeChild(script);
    };
  }, [urlOrderId, searchParams, router, authFetch]);

  const handlePayment = async () => {
    if (!booking) return;
    setLoading(true);
    setError('');

    try {
      // 1. Request secure payment hash from our authoritative server endpoint
      const response = await authFetch('/api/payhere/hash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: booking.id
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to authenticate payment with gateway.');
      }

      const hashData = await response.json();
      const { hash, merchantId, formattedAmount, currency } = hashData;

      // 2. Configure PayHere official checkout payload
      const tokenParam = booking.accessToken ? `?token=${booking.accessToken}` : '';
      const returnUrl = `${window.location.origin}/ticket/${booking.id}${tokenParam}`;
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

      // 3. Register client event listeners
      if (typeof window !== 'undefined' && window.payhere) {
        window.payhere.onCompleted = function onCompleted() {
          sessionStorage.removeItem('bookingDraft');
          router.push(`/ticket/${booking.id}${tokenParam}`);
        };

        window.payhere.onDismissed = function onDismissed() {
          setLoading(false);
        };

        window.payhere.onError = function onError(payhereError: unknown) {
          console.error("PayHere SDK error:", payhereError);
          setError(typeof payhereError === 'string' ? payhereError : 'Payment process was interrupted. Please try again.');
          setLoading(false);
        };

        window.payhere.startPayment(paymentObj);
      } else {
        throw new Error('PayHere payment gateway script failed to load. Please check your internet connection and refresh.');
      }

    } catch (err: unknown) {
      console.error("Payment initiation error:", err);
      const message = err instanceof Error ? err.message : 'Payment failed to initiate.';
      setError(message);
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 font-medium">Verifying booking reservation...</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-white border border-red-200 rounded-2xl shadow-sm">
        <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">✕</div>
        <h2 className="text-lg font-bold text-slate-800 mb-2">No Active Booking Found</h2>
        <p className="text-slate-500 text-sm mb-6">{error || 'Your checkout session may have expired.'}</p>
        <button onClick={() => router.push('/')} className="bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-orange-700 transition">
          Back to Search
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto my-12 px-4">
      <div className="bg-white p-8 border border-slate-200 rounded-2xl shadow-lg">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider bg-orange-100 text-orange-700 px-3 py-1 rounded-full">
              Secure Checkout
            </span>
            <span className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${
              booking.bookingType === 'guest' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {booking.bookingType === 'guest' ? 'Guest Checkout' : 'Account Checkout'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-800 mt-2">Review & Pay</h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Reference: <strong className="text-slate-800 font-bold">{booking.bookingReference || booking.id}</strong>
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl mb-6 text-sm font-medium">
            {error}
          </div>
        )}

        {/* Breakdown Card */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 mb-6 space-y-3 text-sm">
          <div className="flex justify-between items-start">
            <span className="text-slate-500 font-medium">Trip Route</span>
            <span className="font-bold text-slate-800 text-right">
              {booking.tripSnapshot?.routeSnapshot?.startCity} &rarr; {booking.tripSnapshot?.routeSnapshot?.endCity}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Departure</span>
            <span className="font-semibold text-slate-700">
              {booking.tripSnapshot?.departureDate} at {booking.tripSnapshot?.departureTime}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Bus Operator</span>
            <span className="font-semibold text-slate-700">
              {booking.tripSnapshot?.busSnapshot?.name} ({booking.tripSnapshot?.busSnapshot?.type})
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Individual Fare</span>
            <span className="font-semibold text-slate-700">
              Rs. {Number(booking.tripSnapshot?.baseFare || (booking.totalAmount / booking.seats.length)).toFixed(2)} / seat
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Passenger</span>
            <span className="font-semibold text-slate-700">{booking.passengerName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 font-medium">Selected Seats ({booking.seats.length})</span>
            <div className="flex flex-wrap gap-1">
              {booking.seats.map(s => (
                <span key={s} className="px-2 py-0.5 bg-orange-100 text-orange-700 font-bold text-xs rounded">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-3 mt-3 flex justify-between items-center">
            <span className="font-bold text-slate-700 text-base">Total Payable</span>
            <span className="font-black text-2xl text-orange-600">
              Rs. {Number(booking.totalAmount).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Sandbox Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-6 text-xs text-amber-800">
          <p className="font-bold mb-1">🧪 PayHere Sandbox Mode Active</p>
          <p>Test Visa Card: <code className="font-mono bg-amber-100 px-1 py-0.5 rounded font-bold">4916 2175 0161 1292</code> (Expiry: Any future date, CVV: 123)</p>
        </div>

        {/* Pay Button */}
        <button 
          onClick={handlePayment}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer text-base"
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Connecting to PayHere...</span>
            </>
          ) : (
            <>
              <span>🔒 Pay Securely via PayHere • Rs. {Number(booking.totalAmount).toFixed(2)}</span>
            </>
          )}
        </button>

        <div className="mt-6 text-center">
          <Image 
            src="https://www.payhere.lk/downloads/images/payhere_long_banner.png" 
            alt="PayHere Secured Payment Gateway" 
            width={300}
            height={32}
            unoptimized
            className="h-8 w-auto mx-auto opacity-75 grayscale hover:grayscale-0 transition-all" 
          />
        </div>
      </div>
    </div>
  );
}
