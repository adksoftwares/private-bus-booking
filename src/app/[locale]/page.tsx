"use client";

import Header from "@/components/shared/Header";
import SearchForm from "@/components/shared/SearchForm";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Armchair, QrCode, ShieldCheck, Bus, Clock, Navigation, ArrowRight } from "lucide-react";

export default function Home() {
  const tHero = useTranslations('hero');
  const tSearch = useTranslations('search');

  // Sri Lanka Local Date (YYYY-MM-DD)
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const popularRoutes = [
    { 
      from: "Colombo", 
      to: "Kandy", 
      highway: "A1 Intercity", 
      duration: "3h 15m", 
      distance: "115 km",
      type: "Frequent Express"
    },
    { 
      from: "Colombo", 
      to: "Jaffna", 
      highway: "A9 Super Express", 
      duration: "7h 30m", 
      distance: "395 km",
      type: "Luxury Overnight"
    },
    { 
      from: "Colombo", 
      to: "Galle", 
      highway: "Expressway (E01)", 
      duration: "1h 45m", 
      distance: "125 km",
      type: "Direct AC Coach"
    },
    { 
      from: "Jaffna", 
      to: "Batticaloa", 
      highway: "Eastern Link (A15)", 
      duration: "7h 00m", 
      distance: "365 km",
      type: "Daily Scheduled"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 flex flex-col items-center">
        {/* Hero Section */}
        <section className="w-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white pt-20 pb-28 px-4 text-center relative overflow-hidden">
          {/* Subtle background ambient overlay */}
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ea580c_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none"></div>

          <div className="max-w-4xl mx-auto relative z-10">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 border border-orange-500/30 mb-6">
              <Bus className="w-3.5 h-3.5" />
              <span>{tHero('badge')}</span>
            </span>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-6 tracking-tight leading-tight">
              {tHero('title')}
            </h1>

            <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
              {tHero('subtitle')}
            </p>
          </div>
        </section>

        {/* Search Box Overlapping Hero */}
        <section className="w-full max-w-5xl mx-auto px-4 -mt-14 z-20">
          <SearchForm />
        </section>

        {/* Popular Routes Quick Links */}
        <section className="w-full max-w-5xl mx-auto px-4 mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
                  {tSearch('dailyExpress')}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                {tSearch('popularRoutes')}
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Expressway & Intercity Connections
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularRoutes.map((r, i) => (
              <Link
                key={i}
                href={`/search?from=${encodeURIComponent(r.from.toLowerCase())}&to=${encodeURIComponent(r.to.toLowerCase())}&date=${todayStr}`}
                className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-xl hover:border-orange-500/80 transition-all duration-300 transform hover:-translate-y-1.5 group flex flex-col justify-between text-left relative overflow-hidden"
              >
                {/* Top glowing accent border on hover */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div>
                  {/* Top bar: Bus Icon & Highway Badge */}
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white flex items-center justify-center transition-colors duration-300 shadow-xs">
                      <Bus className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 group-hover:border-orange-200 transition-colors">
                      {r.highway}
                    </span>
                  </div>

                  {/* Origin and Destination */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-base font-black text-slate-800 group-hover:text-orange-600 transition-colors">
                      <span>{r.from}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all duration-200 shrink-0" />
                      <span>{r.to}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-400 mt-0.5">
                      {r.type}
                    </div>
                  </div>

                  {/* Distance & Duration Tags */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-2.5 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{r.duration}</span>
                    </div>
                    <span className="text-slate-300">•</span>
                    <div className="flex items-center gap-1.5">
                      <Navigation className="w-3.5 h-3.5 text-slate-400" />
                      <span>{r.distance}</span>
                    </div>
                  </div>
                </div>

                {/* Distinct "Book Now" Action Button */}
                <div className="mt-5 pt-3 border-t border-slate-100">
                  <div className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 group-hover:bg-orange-600 text-slate-700 group-hover:text-white font-bold text-xs flex items-center justify-between transition-all duration-300 border border-slate-200/80 group-hover:border-orange-600 shadow-xs group-hover:shadow-md">
                    <span>{tSearch('bookNow')}</span>
                    <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-200" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Value Proposition & Feature Cards */}
        <section className="w-full max-w-5xl mx-auto px-4 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition text-left">
              <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-4">
                <Armchair className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{tHero('featSeatsTitle')}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{tHero('featSeatsDesc')}</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition text-left">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{tHero('featTicketsTitle')}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{tHero('featTicketsDesc')}</p>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition text-left">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{tHero('featPaymentsTitle')}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{tHero('featPaymentsDesc')}</p>
            </div>
          </div>
        </section>

        {/* Operator Trust Banner */}
        <section className="w-full max-w-5xl mx-auto px-4 mb-20">
          <div className="bg-gradient-to-r from-orange-600 to-orange-500 rounded-3xl p-8 sm:p-10 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-2xl font-black">Are you a private bus owner or operator?</h3>
              <p className="text-orange-100 text-sm max-w-xl">
                List your luxury, semi-luxury, and expressway buses on LankaBus to reach thousands of passengers daily.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link 
                href="/owner/buses/new"
                className="bg-white hover:bg-orange-50 active:scale-95 text-orange-600 font-black px-6 py-3.5 rounded-xl shadow-md hover:shadow-lg transition text-sm flex items-center gap-2 cursor-pointer"
              >
                <span>➕ Register / Add Your Bus</span>
              </Link>
            </div>
          </div>
        </section>
      </main>
      
      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10 text-center text-xs border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="font-bold text-slate-300 text-sm">
            Lanka<span className="text-orange-500">Bus</span> — Sri Lanka Private Bus Booking System
          </div>
          <p>&copy; 2026 LankaBus. Official PayHere Verified Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
