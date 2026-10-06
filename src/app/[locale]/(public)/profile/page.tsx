"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from '@/i18n/routing';
import { User, Lock, Phone, Mail, ArrowLeft, ShieldCheck } from 'lucide-react';

export default function ProfilePage() {
  const { user, authFetch } = useAuth();
  const router = useRouter();
  
  const [name, setName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState('');
  
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    
    // Fetch profile details from backend API
    authFetch('/api/auth/profile')
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (data.profile) {
          if (data.profile.name) setName(data.profile.name);
          if (data.profile.phone) setPhone(data.profile.phone);
        } else if (user.displayName) {
          setName(user.displayName);
        }
      })
      .catch(err => {
        console.error("Error loading user profile:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [user, authFetch]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoadingProfile(true);
    setProfileMessage('');
    setProfileError('');

    try {
      await supabase.auth.updateUser({
        data: { name: name.trim(), displayName: name.trim(), phone: phone.trim() }
      });
      const res = await authFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }
      setProfileMessage('Profile details updated successfully!');
    } catch (err: unknown) {
      const error = err as Error;
      setProfileError(error.message || 'Failed to update profile details.');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email) return;
    setLoadingPassword(true);
    setPasswordMessage('');
    setPasswordError('');

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword
      });
      if (verifyError) {
        throw new Error('Current password is incorrect. Please verify and try again.');
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (updateError) {
        throw updateError;
      }
      
      setPasswordMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: unknown) {
      const error = err as Error;
      setPasswordError(error.message || 'Failed to update password.');
    } finally {
      setLoadingPassword(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <p className="text-slate-500 font-medium mb-4">Please log in to manage your account settings.</p>
        <button 
          onClick={() => router.push('/login')} 
          className="bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl hover:bg-orange-700"
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        
        {/* Header navigation */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-orange-600 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </button>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Authenticated Account
          </span>
        </div>

        {/* Profile Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800">Personal Information</h1>
              <p className="text-xs text-slate-400">Manage your contact details for tickets and booking notifications</p>
            </div>
          </div>

          {profileMessage && (
            <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-medium">
              {profileMessage}
            </div>
          )}
          {profileError && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-medium">
              {profileError}
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Account Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="email" 
                  value={user.email || ''} 
                  disabled 
                  className="pl-10 pr-4 py-3 border border-slate-200 rounded-xl w-full text-sm bg-slate-50 text-slate-500 font-medium cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                  className="pl-10 pr-4 py-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium" 
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Mobile Number (for SMS & E-Tickets)
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input 
                  type="tel" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  placeholder="0771234567"
                  className="pl-10 pr-4 py-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium font-mono" 
                />
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loadingProfile} 
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer active:scale-95 text-sm"
            >
              {loadingProfile ? 'Saving Changes...' : 'Save Profile Changes'}
            </button>
          </form>
        </div>

        {/* Security Card */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-md">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800">Security & Password</h2>
              <p className="text-xs text-slate-400">Update your sign-in password</p>
            </div>
          </div>

          {passwordMessage && (
            <div className="mb-6 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs sm:text-sm font-medium">
              {passwordMessage}
            </div>
          )}
          {passwordError && (
            <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-medium">
              {passwordError}
            </div>
          )}

          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Current Password
              </label>
              <input 
                type="password" 
                value={currentPassword} 
                onChange={e => setCurrentPassword(e.target.value)} 
                required 
                className="p-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                New Password
              </label>
              <input 
                type="password" 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)} 
                required 
                minLength={6} 
                placeholder="At least 6 characters"
                className="p-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500" 
              />
            </div>

            <button 
              type="submit" 
              disabled={loadingPassword} 
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer active:scale-95 text-sm"
            >
              {loadingPassword ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}