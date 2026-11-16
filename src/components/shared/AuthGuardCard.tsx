"use client";

import React from 'react';
import { Link, useRouter } from '@/i18n/routing';
import { LogIn, ArrowLeft, ShieldAlert } from 'lucide-react';

interface AuthGuardCardProps {
  badgeText?: string;
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  loginRedirect?: string;
  loginButtonText?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}

export default function AuthGuardCard({
  badgeText = "Protected Portal",
  title,
  description,
  icon: Icon = ShieldAlert,
  loginRedirect,
  loginButtonText = "Sign In to Continue",
  secondaryHref = "/",
  secondaryLabel = "Return to Homepage",
}: AuthGuardCardProps) {
  const router = useRouter();

  const handleSignIn = () => {
    if (loginRedirect) {
      router.push(`/login?redirect=${encodeURIComponent(loginRedirect)}`);
    } else {
      router.push('/login');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md bg-white p-7 sm:p-9 rounded-3xl border border-slate-200/80 shadow-[0_10px_35px_rgba(18,31,43,0.06)] text-center transition-all">
        {/* Icon & Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-[11px] font-black uppercase tracking-wider mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600 animate-pulse" />
          <span>{badgeText}</span>
        </div>

        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-5 shadow-xs border border-orange-200/60">
          <Icon className="w-8 h-8 stroke-[2.2]" />
        </div>

        {/* Content */}
        <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2.5">
          {title}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mb-8 leading-relaxed font-medium">
          {description}
        </p>

        {/* Actions */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleSignIn}
            className="w-full inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white font-black py-3.5 px-5 rounded-2xl transition shadow-md shadow-orange-600/20 text-sm cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>{loginButtonText}</span>
          </button>

          <Link
            href={secondaryHref}
            className="w-full inline-flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 active:scale-[0.98] text-slate-700 font-bold py-3 px-5 rounded-2xl transition border border-slate-200/80 text-xs cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{secondaryLabel}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
