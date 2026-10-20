"use client";

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter, Link } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { Bus, Lock, Mail, Eye, EyeOff, Sparkles, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect') || '/';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) {
        setError(signInError.message || 'Invalid email or password. Please verify your login credentials.');
        return;
      }

      if (data.session) {
        router.push(redirectUrl);
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-3 sm:p-5 bg-slate-50">
      <div className="w-full max-w-md bg-white p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm sm:shadow-md">
        
        {/* Guest Reassurance Notice */}
        <div className="mb-5 sm:mb-6 p-3.5 bg-orange-50 border border-orange-200 rounded-xl sm:rounded-2xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <Sparkles className="w-4 h-4 text-orange-500 shrink-0" />
            <span>Booking a bus today?</span>
          </div>
          <Link
            href="/"
            className="text-orange-600 font-bold hover:text-orange-700 flex items-center gap-0.5 shrink-0"
          >
            <span>Book as Guest</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="text-center mb-8">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white font-bold text-2xl shadow-sm mx-auto mb-3.5">
            <Bus className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome Back</h1>
          <p className="text-slate-500 text-xs sm:text-sm mt-1">Sign in to manage your bus bookings, fleet, and tickets</p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="email" 
                placeholder="passenger@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 pr-4 py-3.5 min-h-12 border border-slate-300 rounded-xl w-full text-base sm:text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-normal transition-shadow"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type={showPassword ? 'text' : 'password'} 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-10 py-3.5 min-h-12 border border-slate-300 rounded-xl w-full text-base sm:text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 font-normal transition-shadow"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-900 p-2 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full min-h-12 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3.5 px-4 rounded-xl transition-colors shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99] text-sm flex items-center justify-center gap-2 mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center mt-8 pt-6 border-t border-slate-100 text-xs sm:text-sm text-slate-500">
          Don&apos;t have an account?{' '}
          <Link href={`/register${redirectUrl !== '/' ? `?redirect=${encodeURIComponent(redirectUrl)}` : ''}`} className="text-orange-600 font-bold hover:underline">
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
