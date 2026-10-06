"use client";

import Header from "@/components/shared/Header";
import SearchForm from "@/components/shared/SearchForm";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { 
  Bus, 
  Clock, 
  Navigation, 
  ArrowRight, 
  ShieldCheck, 
  Armchair, 
  QrCode, 
  CheckCircle2
} from "lucide-react";

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
      highway: "Central Expressway (E04)", 
      duration: "2h 45m", 
      distance: "115 km",
      type: "Semi Luxury & AC Coach",
      startingFare: "Rs. 950"
    },
    { 
      from: "Colombo", 
      to: "Jaffna", 
      highway: "A9 Super Express", 
      duration: "7h 15m", 
      distance: "395 km",
      type: "2+1 VIP Sleeper & Luxury AC",
      startingFare: "Rs. 2,800"
    },
    { 
      from: "Colombo", 
      to: "Galle", 
      highway: "Southern Expressway (E01)", 
      duration: "1h 30m", 
      distance: "125 km",
      type: "Direct Highway Super Coach",
      startingFare: "Rs. 1,150"
    },
    { 
      from: "Colombo", 
      to: "Batticaloa", 
      highway: "A11 Eastern Express", 
      duration: "7h 30m", 
      distance: "315 km",
      type: "Luxury Intercity AC",
      startingFare: "Rs. 2,400"
    }
  ];

  const features = [
    {
      icon: Bus,
      title: "Individual Bus Fares",
      desc: "Compare buses on the same route. Each bus sets its own fare based on vehicle category and onboard luxury."
    },
    {
      icon: Armchair,
      title: "Authentic Seating Layouts",
      desc: "Live interactive seat selection matching actual Sri Lankan buses — 2x3 Normal, 2x2 Luxury, and 2+1 VIP."
    },
    {
      icon: QrCode,
      title: "Instant Digital Boarding Pass",
      desc: "Receive your QR boarding pass immediately. Verified single-use scanning makes conductor check-in seamless."
    },
    {
      icon: ShieldCheck,
      title: "Guest Booking Welcome",
      desc: "Account creation is strictly optional. Complete your booking in 60 seconds using your contact details."
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="flex-1 flex flex-col items-center">
        
        {/* Commercial Hero Section */}
        <section className="w-full bg-slate-900 text-white pt-16 pb-24 px-4 text-center relative overflow-hidden border-b border-slate-800">
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0 opacity-5 bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>

          <div className="max-w-4xl mx-auto relative z-10">
            
            {/* National Intercity Network Tag */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/30 mb-6">
              <Bus className="w-3.5 h-3.5 text-orange-500" />
              <span>{tHero('badge')}</span>
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black mb-5 tracking-tight leading-tight text-white">
              {tHero('title')}
            </h1>

            <p className="text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto mb-6 leading-relaxed font-normal">
              {tHero('subtitle')}
            </p>

            {/* Micro Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs font-semibold text-slate-400">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Verified Operators</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>PayHere LKR Gateway</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Instant QR Confirmation</span>
              </div>
            </div>

          </div>
        </section>

        {/* Primary Search Interface Overlapping Hero */}
        <section className="w-full max-w-5xl mx-auto px-4 -mt-10 sm:-mt-12 z-20">
          <SearchForm />
        </section>

        {/* Key Platform Value Pillars */}
        <section className="w-full max-w-5xl mx-auto px-4 mt-14 sm:mt-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feat, i) => {
              const Icon = feat.icon;
              return (
                <div 
                  key={i} 
                  className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center mb-3">
                      <Icon className="w-5 h-5 stroke-[2.2]" />
                    </div>
                    <h3 className="font-black text-sm text-slate-900 mb-1.5">
                      {feat.title}
                    </h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {feat.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Popular Sri Lanka Express Routes */}
        <section className="w-full max-w-5xl mx-auto px-4 mt-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-5 gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-orange-600"></span>
                <span className="text-xs font-black uppercase tracking-wider text-orange-600">
                  {tSearch('dailyExpress')}
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {tSearch('popularRoutes')}
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              Direct Highway & Intercity Express Connections
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popularRoutes.map((r, i) => (
              <Link
                key={i}
                href={`/search?from=${encodeURIComponent(r.from.toLowerCase())}&to=${encodeURIComponent(r.to.toLowerCase())}&date=${todayStr}`}
                className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-orange-500 transition-all duration-200 group flex flex-col justify-between text-left"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {r.highway}
                    </span>
                    <span className="text-xs font-black text-orange-600">
                      {r.startingFare}
                    </span>
                  </div>

                  {/* Route City Pair */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2 text-base font-black text-slate-900 group-hover:text-orange-600 transition-colors">
                      <span>{r.from}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-transform shrink-0" />
                      <span>{r.to}</span>
                    </div>
                    <div className="text-xs font-semibold text-slate-400 mt-0.5">
                      {r.type}
                    </div>
                  </div>

                  {/* Journey Specs */}
                  <div className="flex items-center gap-3 text-xs text-slate-500 font-medium pt-3 border-t border-slate-100">
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

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-orange-600 group-hover:text-orange-700">
                  <span>View Buses</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Bus Operator Partnership CTA */}
        <section className="w-full max-w-5xl mx-auto px-4 my-16">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-10 flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800 shadow-xl">
            <div className="max-w-xl">
              <span className="text-xs font-black uppercase tracking-wider text-orange-400 mb-2 block">
                For Private Bus Operators
              </span>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight mb-2">
                List Your Buses & Manage Intercity Bookings
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Connect your fleet with thousands of daily passengers across Sri Lanka. Set custom bus fares per trip, configure 2x3 or 2x2 seat layouts, and authorize conductors with instant mobile QR scanners.
              </p>
            </div>
            <Link 
              href="/owner/buses"
              className="bg-orange-600 hover:bg-orange-700 text-white font-black px-6 py-3.5 rounded-xl transition shadow-md whitespace-nowrap text-sm shrink-0"
            >
              Operator Portal & Fleet Setup &rarr;
            </Link>
          </div>
        </section>

      </main>

      {/* Commercial Transportation Footer */}
      <footer className="w-full bg-white border-t border-slate-200/80 py-10 px-4 text-slate-500 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center font-black text-sm">
              <Bus className="w-4 h-4" />
            </div>
            <span className="font-black text-slate-800 text-sm">LankaBus Intercity</span>
            <span className="text-slate-300">|</span>
            <span>Sri Lanka Private Bus Ticketing Platform</span>
          </div>
          <div className="flex items-center gap-6 font-semibold">
            <Link href="/" className="hover:text-slate-800 transition">Find Buses</Link>
            <Link href="/bookings" className="hover:text-slate-800 transition">Booking Lookup</Link>
            <Link href="/owner/buses" className="hover:text-slate-800 transition">Bus Operators</Link>
            <Link href="/scan" className="hover:text-slate-800 transition">Conductor Scanner</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
