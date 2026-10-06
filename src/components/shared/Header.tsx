"use client";

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { useLocale } from 'next-intl';

export default function Header() {
  const { user, isStaff, isOwner, isAdmin } = useAuth();
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

  const handleLanguageChange = (newLocale: 'en' | 'ta' | 'si') => {
    router.replace(pathname, { locale: newLocale });
  };

  const handleSignOut = async () => {
    const { getAuth, signOut } = await import('firebase/auth');
    await signOut(getAuth());
    setIsProfileOpen(false);
    router.push('/');
  };

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-slate-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-600 to-orange-500 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition-transform">
            🚌
          </div>
          <div>
            <span className="font-black text-2xl tracking-tight text-slate-800">
              Lanka<span className="text-orange-600">Bus</span>
            </span>
            <span className="hidden sm:block text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
              Sri Lanka Intercity
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-orange-600 transition">
            Find Buses
          </Link>

          {user && (
            <Link href="/bookings" className="text-sm font-semibold text-slate-600 hover:text-orange-600 transition">
              My Bookings
            </Link>
          )}

          {(isOwner || isAdmin) && (
            <Link 
              href="/owner/buses" 
              className="text-sm font-bold text-orange-600 hover:text-orange-700 transition flex items-center gap-1.5"
            >
              <span>🚌</span> Manage Fleet
            </Link>
          )}

          {isStaff && (
            <Link 
              href="/scan" 
              className="text-xs font-bold uppercase tracking-wider bg-slate-900 text-orange-400 hover:text-orange-300 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              <span>🛡️</span> Conductor Terminal
            </Link>
          )}
        </nav>

        {/* Right side: Language Switcher & User Profile */}
        <div className="flex items-center gap-3">
          
          {/* Language Selector Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${currentLocale === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              title="English"
            >
              EN
            </button>
            <button
              onClick={() => handleLanguageChange('ta')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${currentLocale === 'ta' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              title="தமிழ்"
            >
              தமிழ்
            </button>
            <button
              onClick={() => handleLanguageChange('si')}
              className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${currentLocale === 'si' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
              title="සිංහල"
            >
              සිං
            </button>
          </div>

          {/* User Auth Controls */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:ring-2 hover:ring-orange-200 transition cursor-pointer"
              >
                <div className="w-9 h-9 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-800 font-bold text-sm shadow-xs">
                  {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                </div>
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl transition-all z-50 py-2">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-400 uppercase font-semibold">Signed in as</p>
                    <p className="text-sm font-bold text-slate-800 truncate">{user.displayName || user.email}</p>
                  </div>

                  <Link 
                    href="/bookings" 
                    onClick={() => setIsProfileOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                  >
                    🎫 My Bookings
                  </Link>

                  <Link 
                    href="/profile" 
                    onClick={() => setIsProfileOpen(false)}
                    className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                  >
                    ⚙️ Account Settings
                  </Link>

                  {(isOwner || isAdmin) ? (
                    <>
                      <Link 
                        href="/owner/buses" 
                        onClick={() => setIsProfileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                      >
                        🚌 My Bus Fleet
                      </Link>
                      <Link 
                        href="/owner/trips" 
                        onClick={() => setIsProfileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                      >
                        📅 Trip Schedules & Fares
                      </Link>
                      <Link 
                        href="/owner/trips/new" 
                        onClick={() => setIsProfileOpen(false)}
                        className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                      >
                        ➕ Schedule New Trip
                      </Link>
                    </>
                  ) : (
                    <Link 
                      href="/owner/buses" 
                      onClick={() => setIsProfileOpen(false)}
                      className="block px-4 py-2.5 text-sm text-orange-600 hover:bg-orange-50 font-bold transition"
                    >
                      💼 Register as Bus Operator
                    </Link>
                  )}

                  {isStaff && (
                    <Link 
                      href="/scan" 
                      onClick={() => setIsProfileOpen(false)}
                      className="block px-4 py-2.5 text-sm text-slate-700 hover:bg-orange-50 hover:text-orange-700 font-medium transition"
                    >
                      🛡️ Conductor Scanner
                    </Link>
                  )}

                  <div className="border-t border-slate-100 my-1"></div>

                  <button 
                    onClick={handleSignOut}
                    className="block w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 font-medium transition cursor-pointer"
                  >
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link 
                href="/login" 
                className="text-sm font-bold text-slate-700 hover:text-orange-600 px-3 py-2 transition"
              >
                Log In
              </Link>
              <Link 
                href="/register" 
                className="text-sm font-bold bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl transition shadow-sm hover:shadow active:scale-95"
              >
                Sign Up
              </Link>
            </div>
          )}

          {/* Mobile menu button */}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg"
          >
            <span className="text-xl">☰</span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 space-y-2">
          <Link 
            href="/" 
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-2 text-sm font-semibold text-slate-700"
          >
            Find Buses
          </Link>
          {user && (
            <Link 
              href="/bookings" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-slate-700"
            >
              My Bookings
            </Link>
          )}
          {(isOwner || isAdmin) ? (
            <>
              <Link 
                href="/owner/buses" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 text-sm font-semibold text-slate-700"
              >
                🚌 Manage Fleet
              </Link>
              <Link 
                href="/owner/trips" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 text-sm font-semibold text-slate-700"
              >
                📅 Scheduled Trips & Fares
              </Link>
              <Link 
                href="/owner/trips/new" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="block py-2 text-sm font-bold text-orange-600"
              >
                ➕ Schedule New Trip
              </Link>
            </>
          ) : user && (
            <Link 
              href="/owner/buses" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-sm font-semibold text-orange-600"
            >
              💼 Register as Bus Operator
            </Link>
          )}
          {isStaff && (
            <Link 
              href="/scan" 
              onClick={() => setIsMobileMenuOpen(false)}
              className="block py-2 text-sm font-bold text-orange-600"
            >
              Conductor Terminal
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
