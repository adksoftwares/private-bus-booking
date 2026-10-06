"use client";

import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '@/lib/firebase';
import { useRouter, Link } from '@/i18n/routing';
import { Bus, Lock, Mail, User as UserIcon } from 'lucide-react';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // 2. Set display name in Auth
      if (name.trim()) {
        await updateProfile(user, { displayName: name.trim() });
      }

      // 3. Persist default Passenger profile in Realtime Database
      await set(ref(db, `users/${user.uid}`), {
        uid: user.uid,
        name: name.trim() || 'Passenger',
        email: email.trim(),
        role: 'Passenger',
        createdAt: Date.now()
      });

      router.push('/');
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj.code === 'auth/email-already-in-use') {
        setError('This email address is already registered. Please log in.');
      } else if (errorObj.code === 'auth/weak-password') {
        setError('Password is too weak. Please use at least 6 characters.');
      } else {
        setError(errorObj.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[85vh] items-center justify-center p-4 bg-slate-50">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl border border-slate-200 shadow-xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-600 to-orange-500 flex items-center justify-center text-white font-black text-2xl shadow-md mx-auto mb-3">
            <Bus className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black text-slate-800">Create Account</h1>
          <p className="text-slate-500 text-sm mt-1">Join LankaBus to book seats and access your tickets anywhere</p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs sm:text-sm font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Full Name
            </label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="e.g. Sahan Perera" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-10 pr-4 py-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="email" 
                placeholder="passenger@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 pr-4 py-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                required
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="password" 
                placeholder="At least 6 characters" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-4 py-3 border border-slate-300 rounded-xl w-full text-sm outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-medium"
                required
                minLength={6}
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3.5 rounded-xl transition shadow-md hover:shadow-lg disabled:opacity-50 cursor-pointer active:scale-95 text-sm flex items-center justify-center gap-2 mt-2"
          >
            {loading ? 'Creating Account...' : 'Sign Up Free'}
          </button>
        </form>

        <div className="text-center mt-8 pt-6 border-t border-slate-100 text-xs sm:text-sm text-slate-500">
          Already have an account?{' '}
          <Link href="/login" className="text-orange-600 font-bold hover:underline">
            Log In
          </Link>
        </div>
      </div>
    </div>
  );
}
