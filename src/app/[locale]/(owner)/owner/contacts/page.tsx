"use client";
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

type Contact = { id: string; name: string; phone: string; contact_type: string; can_control_tracking: boolean; active: boolean };
export default function OwnerContactsPage() {
  const { user, isOwner, isAdmin, authFetch, loading } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactType, setContactType] = useState('supervisor');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const res = await authFetch('/api/owner/contacts');
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Unable to load contacts.');
    setContacts(json.contacts || []);
  };
  useEffect(() => { if (user && (isOwner || isAdmin)) load().catch(e => setMessage(e.message)); }, [user, isOwner, isAdmin]);
  const add = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const res = await authFetch('/api/owner/contacts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, contactType, canControlTracking: true })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to add contact.');
      setName(''); setPhone(''); await load(); setMessage('Contact added successfully.');
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    const res = await authFetch('/api/owner/contacts?id=' + encodeURIComponent(id), { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) { setMessage(json.error || 'Unable to remove contact.'); return; }
    setContacts(items => items.filter(item => item.id !== id));
  };
  if (loading) return <main className="p-8">Loading…</main>;
  if (!user || (!isOwner && !isAdmin)) return <main className="p-8">Bus owner access is required.</main>;
  return <main className="mx-auto max-w-4xl space-y-6 p-5 sm:p-8">
    <header><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Fleet administration</p><h1 className="mt-2 text-3xl font-black text-slate-900">Contact & Supervisor Management</h1><p className="mt-2 text-sm text-slate-500">Add the mobile numbers used by your bus operation and assign supervisor tracking access.</p></header>
    <form onSubmit={add} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Full name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Mobile number<input required type="tel" placeholder="0771234567 or +94771234567" value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
      <label className="text-sm font-semibold text-slate-700">Contact role<select value={contactType} onChange={e=>setContactType(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-normal"><option value="supervisor">Supervisor (tracking control)</option><option value="driver">Driver</option><option value="conductor">Conductor</option><option value="office">Office</option><option value="emergency">Emergency contact</option></select></label>
      <div className="flex items-end"><button disabled={busy} className="w-full rounded-xl bg-slate-900 p-3 font-bold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Add mobile number'}</button></div>
      <p className="sm:col-span-2 text-xs text-slate-500">Supervisor access is matched to the mobile number on the supervisor's signed-in account. Scope can be limited to a bus or trip through the API.</p>
    </form>
    {message && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <h2 className="border-b border-slate-100 p-5 font-bold text-slate-900">Registered contact numbers</h2>
      {contacts.length === 0 ? <p className="p-6 text-sm text-slate-500">No contact numbers added yet.</p> : contacts.map(contact=><div key={contact.id} className="flex items-center justify-between gap-4 border-b border-slate-100 p-4 last:border-0">
        <div><p className="font-semibold text-slate-900">{contact.name}</p><p className="text-sm text-slate-500">{contact.phone} · {contact.contact_type}</p><p className="text-xs text-slate-400">{contact.can_control_tracking ? 'Tracking control enabled' : 'View only'}</p></div>
        <button onClick={()=>remove(contact.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">Remove</button>
      </div>)}
    </section>
  </main>;
}
