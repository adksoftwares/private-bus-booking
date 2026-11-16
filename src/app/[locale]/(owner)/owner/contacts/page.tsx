"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import AuthGuardCard from '@/components/shared/AuthGuardCard';
import { PhoneCall, Plus, Trash2, Users, ShieldCheck, UserCheck } from 'lucide-react';

type Contact = { id: string; name: string; phone: string; contact_type: string };

export default function OwnerContactsPage() {
  const { user, isOwner, isAdmin, authFetch, loading } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactType, setContactType] = useState('driver');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await authFetch('/api/owner/contacts');
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Unable to load contacts.');
    setContacts(j.contacts || []);
  };

  useEffect(() => {
    if (user && (isOwner || isAdmin)) {
      load().catch((e: Error) => setMessage(e.message));
    }
  }, [user, isOwner, isAdmin]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const r = await authFetch('/api/owner/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, contactType })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Unable to add contact.');
      setName('');
      setPhone('');
      await load();
      setMessage('Contact number saved.');
    } catch (e: unknown) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const r = await authFetch('/api/owner/contacts?id=' + encodeURIComponent(id), { method: 'DELETE' });
    const j = await r.json();
    if (!r.ok) {
      setMessage(j.error || 'Unable to remove contact.');
      return;
    }
    setContacts(items => items.filter(x => x.id !== id));
  };

  if (loading && !user) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Verifying operator credentials...</p>
      </div>
    );
  }

  if (!user || (!isOwner && !isAdmin)) {
    return (
      <AuthGuardCard
        icon={PhoneCall}
        badgeText="Fleet Administration"
        title="Bus Operator Contacts"
        description="Please sign in to your registered Bus Operator account to manage verified drivers, conductors, and emergency dispatch numbers."
        loginRedirect="/owner/contacts"
        loginButtonText="Sign In as Operator"
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <header>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-black uppercase tracking-wider mb-2">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Fleet Administration</span>
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Bus Contact Numbers</h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 leading-relaxed font-medium">
          Store driver, conductor, office and emergency contacts. A phone number alone never grants GPS access; drivers and conductors must sign in and be assigned to a trip.
        </p>
      </header>

      <form onSubmit={add} className="grid gap-4 rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-7 shadow-xs sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          Full Name
          <input
            required
            minLength={2}
            placeholder="e.g. Sunil Perera"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition-all"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Sri Lankan Mobile Number
          <input
            required
            type="tel"
            placeholder="0771234567"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition-all"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Contact Role / Type
          <select
            value={contactType}
            onChange={e => setContactType(e.target.value)}
            className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-3.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer"
          >
            <option value="driver">Driver (Bus Captain)</option>
            <option value="conductor">Conductor (Ticket Inspector)</option>
            <option value="supervisor">Trip Supervisor</option>
            <option value="office">Operator Office / Booking Counter</option>
            <option value="emergency">Emergency Dispatch</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-600 hover:bg-orange-700 active:scale-[0.98] p-3.5 text-sm font-black text-white shadow-md shadow-orange-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>{busy ? 'Saving...' : 'Add Contact Number'}</span>
          </button>
        </div>
      </form>

      {message && (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-700 shadow-2xs">
          {message}
        </div>
      )}

      <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center gap-2 border-b border-slate-100 p-5 sm:p-6 bg-slate-50/50">
          <Users className="w-4 h-4 text-orange-600" />
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Saved Fleet Contacts ({contacts.length})</h2>
        </div>
        {contacts.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400 font-semibold">
            No contacts saved yet. Add your drivers, conductors, and dispatch personnel above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-4 p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{c.name}</p>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      {c.phone} &bull; <span className="capitalize text-orange-600 font-bold">{c.contact_type}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-xl border border-rose-200 hover:bg-rose-50 px-3.5 py-2 text-xs font-black text-rose-600 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
