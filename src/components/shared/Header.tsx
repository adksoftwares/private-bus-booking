"use client";

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { 
  Bus, 
  Ticket, 
  Search, 
  ShieldCheck, 
  User as UserIcon, 
  Briefcase, 
  LogOut, 
  Menu, 
  X, 
  ChevronDown,
  Calendar,
  Settings,
  Plus
} from 'lucide-react';

export default function Header() {
  const { user, isStaff, isOwner, isAdmin, role, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setIsMobileMenuOpen(false);
  }

  const handleLanguageChange = (newLocale: 'en' | 'ta' | 'si') => {
    router.replace(pathname, { locale: newLocale });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error("Sign out error:", e);
    }
    setIsProfileOpen(false);
    setIsMobileMenuOpen(false);
    router.push('/');
  };

  const isHomeActive = pathname === '/';
  const isBookingsActive = pathname.startsWith('/bookings');
  const isOwnerActive = pathname.startsWith('/owner');
  const isScanActive = pathname.startsWith('/scan');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        
        {/* Brand Logo & Tagline */}
        <Link href="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-sm group-hover:bg-orange-700 transition-colors">
            <Bus className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-xl tracking-tight text-slate-900 group-hover:text-orange-600 transition-colors">
              Lanka<span className="text-orange-600">Bus</span>
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Intercity Express
            </span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-2">
          <Link 
            href="/" 
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              isHomeActive 
                ? 'bg-slate-100 text-slate-900 font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <span>Find Buses</span>
          </Link>

          <Link 
            href="/bookings" 
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              isBookingsActive 
                ? 'bg-slate-100 text-slate-900 font-black' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Ticket className="w-3.5 h-3.5 text-slate-400" />
            <span>{user ? 'My Bookings' : 'Find My Ticket'}</span>
          </Link>

          {(isOwner || isAdmin) && (
            <Link 
              href="/owner/buses" 
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                isOwnerActive 
                  ? 'bg-orange-50 text-orange-700 border border-orange-200' 
                  : 'text-slate-700 hover:text-orange-600 hover:bg-orange-50/60'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-orange-600" />
              <span>Fleet Manager</span>
            </Link>
          )}

          {isStaff && (
            <Link 
              href="/scan" 
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                isScanActive
                  ? 'bg-slate-900 text-orange-400 ring-2 ring-orange-500'
                  : 'bg-slate-900 text-slate-200 hover:text-orange-400'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-orange-500" />
              <span>Conductor Terminal</span>
            </Link>
          )}
        </nav>

        {/* Right Action Cluster: Language Switcher + User Profile / Sign In */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Multi-language Segmented Selector */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold border border-slate-200/60">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                currentLocale === 'en' 
                  ? 'bg-white text-slate-900 shadow-xs font-black' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="English"
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageChange('ta')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                currentLocale === 'ta' 
                  ? 'bg-white text-slate-900 shadow-xs font-black' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="தமிழ்"
            >
              தமிழ்
            </button>
            <button
              onClick={() => handleLanguageChange('si')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer text-[11px] ${
                currentLocale === 'si' 
                  ? 'bg-white text-slate-900 shadow-xs font-black' 
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="සිංහල"
            >
              සිං
            </button>
          </div>

          {/* User Account State */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition cursor-pointer border border-slate-200"
                aria-label="User Account Menu"
              >
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500 hidden sm:block mr-1" />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl transition-all z-50 py-2 divide-y divide-slate-100">
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Account</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 capitalize">
                        {role || 'Passenger'}
                      </span>
                    </div>
                    <p className="text-sm font-black text-slate-900 truncate">
                      {user.displayName || user.email}
                    </p>
                    {user.email && user.displayName && (
                      <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                    )}
                  </div>

                  <div className="py-1.5 text-xs font-semibold text-slate-700">
                    <Link 
                      href="/bookings" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 hover:text-orange-600 transition"
                    >
                      <Ticket className="w-4 h-4 text-slate-400" />
                      <span>My Bookings</span>
                    </Link>

                    <Link 
                      href="/profile" 
                      onClick={() => setIsProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 hover:text-orange-600 transition"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      <span>Account Settings</span>
                    </Link>
                  </div>

                  {(isOwner || isAdmin) ? (
                    <div className="py-1.5 text-xs font-semibold text-slate-700 bg-slate-50/50">
                      <p className="px-4 pt-1 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Operator Control
                      </p>
                      <Link 
                        href="/owner/buses" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-white hover:text-orange-600 transition"
                      >
                        <Bus className="w-4 h-4 text-orange-600" />
                        <span>Manage Buses</span>
                      </Link>
                      <Link 
                        href="/owner/trips" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-white hover:text-orange-600 transition"
                      >
                        <Calendar className="w-4 h-4 text-orange-600" />
                        <span>Trip Schedules & Fares</span>
                      </Link>
                      <Link 
                        href="/owner/trips/new" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-white hover:text-orange-600 transition"
                      >
                        <Plus className="w-4 h-4 text-orange-600" />
                        <span>Schedule New Trip</span>
                      </Link>
                    </div>
                  ) : (
                    <div className="py-1.5 text-xs font-semibold text-slate-700">
                      <Link 
                        href="/owner/buses" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-orange-600 hover:bg-orange-50 font-bold transition"
                      >
                        <Briefcase className="w-4 h-4" />
                        <span>Register as Bus Operator</span>
                      </Link>
                    </div>
                  )}

                  {isStaff && (
                    <div className="py-1.5 text-xs font-semibold text-slate-700">
                      <Link 
                        href="/scan" 
                        onClick={() => setIsProfileOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 hover:bg-slate-900 hover:text-orange-400 transition"
                      >
                        <ShieldCheck className="w-4 h-4 text-orange-500" />
                        <span>Conductor Terminal</span>
                      </Link>
                    </div>
                  )}

                  <div className="py-1">
                    <button 
                      onClick={handleSignOut}
                      className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link 
                href="/login" 
                className="text-xs font-bold text-slate-700 hover:text-orange-600 px-3 py-2 rounded-xl transition hover:bg-slate-100"
              >
                Log In
              </Link>
              <Link 
                href="/register" 
                className="text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white px-3.5 py-2 rounded-xl transition shadow-xs active:scale-95"
              >
                Sign Up
              </Link>
            </div>
          )}

          {/* Mobile Menu Hamburger Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3 shadow-lg">
          <nav className="flex flex-col gap-1 text-sm font-bold text-slate-700">
            <Link 
              href="/" 
              className={`p-3 rounded-xl flex items-center gap-3 transition ${
                isHomeActive ? 'bg-orange-50 text-orange-600' : 'hover:bg-slate-50'
              }`}
            >
              <Search className="w-4 h-4 text-orange-600" />
              <span>Find Buses</span>
            </Link>

            <Link 
              href="/bookings" 
              className={`p-3 rounded-xl flex items-center gap-3 transition ${
                isBookingsActive ? 'bg-orange-50 text-orange-600' : 'hover:bg-slate-50'
              }`}
            >
              <Ticket className="w-4 h-4 text-orange-600" />
              <span>{user ? 'My Bookings' : 'Find My Ticket (Guest Lookup)'}</span>
            </Link>

            {(isOwner || isAdmin) && (
              <Link 
                href="/owner/buses" 
                className={`p-3 rounded-xl flex items-center gap-3 transition ${
                  isOwnerActive ? 'bg-orange-50 text-orange-600' : 'hover:bg-slate-50'
                }`}
              >
                <Briefcase className="w-4 h-4 text-orange-600" />
                <span>Fleet & Trips Manager</span>
              </Link>
            )}

            {isStaff && (
              <Link 
                href="/scan" 
                className={`p-3 rounded-xl flex items-center gap-3 transition ${
                  isScanActive ? 'bg-slate-900 text-orange-400' : 'bg-slate-900 text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-orange-500" />
                <span>Conductor Verification Terminal</span>
              </Link>
            )}

            {user && (
              <Link 
                href="/profile" 
                className="p-3 rounded-xl flex items-center gap-3 hover:bg-slate-50 transition"
              >
                <UserIcon className="w-4 h-4 text-slate-500" />
                <span>Account Profile</span>
              </Link>
            )}
          </nav>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400 font-medium">Language</span>
            <div className="flex gap-1">
              <button 
                onClick={() => handleLanguageChange('en')} 
                className={`px-3 py-1.5 rounded-lg font-bold ${currentLocale === 'en' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                English
              </button>
              <button 
                onClick={() => handleLanguageChange('ta')} 
                className={`px-3 py-1.5 rounded-lg font-bold ${currentLocale === 'ta' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                தமிழ்
              </button>
              <button 
                onClick={() => handleLanguageChange('si')} 
                className={`px-3 py-1.5 rounded-lg font-bold ${currentLocale === 'si' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                සිංහල
              </button>
            </div>
          </div>

          {user && (
            <button 
              onClick={handleSignOut}
              className="w-full mt-2 p-3 text-center text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>
      )}
    </header>
  );
}
