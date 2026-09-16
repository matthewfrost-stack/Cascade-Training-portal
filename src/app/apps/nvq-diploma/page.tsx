'use client';

import { useEffect, useMemo, useState } from 'react';
import MainHeader from '@/app/components/MainHeader';
import QualificationTimeline, { type QualificationTimelineEvent } from '@/app/components/QualificationTimeline';
import UniformButton from '@/app/components/UniformButton';
import { hasPermission } from '@/lib/permissions';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

type Location = { id: string; name: string };
type Lead = {
  id: string;
  location_id: string;
  qualification_type: 'nvq' | 'diploma';
  qualification_name: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  stage: string;
  enquiry_date: string;
  target_completion_date: string | null;
  completion_date: string | null;
  notes: string | null;
  locations?: Location | Location[] | null;
  qualification_lead_timeline?: QualificationTimelineEvent[];
};

type LeadForm = {
  location_id: string;
  qualification_type: 'nvq' | 'diploma';
  qualification_name: string;
  full_name: string;
  email: string;
  phone: string;
  enquiry_date: string;
  target_completion_date: string;
  notes: string;
};

const stages = ['enquiry', 'application', 'offer', 'enrolled', 'in_progress', 'completed', 'withdrawn'];
const stageLabels: Record<string, string> = {
  enquiry: 'Enquiry',
  application: 'Application',
  offer: 'Offer',
  enrolled: 'Enrolled',
  in_progress: 'In progress',
  completed: 'Completed',
  withdrawn: 'Withdrawn',
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function locationName(lead: Lead) {
  return Array.isArray(lead.locations) ? lead.locations[0]?.name || 'Unknown location' : lead.locations?.name || 'Unknown location';
}

function dateLabel(value: string | null) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const emptyForm = (): LeadForm => ({
  location_id: '',
  qualification_type: 'nvq',
  qualification_name: '',
  full_name: '',
  email: '',
  phone: '',
  enquiry_date: today(),
  target_completion_date: '',
  notes: '',
});

export default function NvqDiplomaPage() {
  const { profile, loading: profileLoading } = useCurrentUserProfile();
  const canView = hasPermission(profile?.role_tier || null, 'QUALIFICATIONS', 'canView');
  const canEdit = hasPermission(profile?.role_tier || null, 'QUALIFICATIONS', 'canEdit');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState('all');
  const [filterStage, setFilterStage] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLeads() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/qualifications', { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load qualification tracking.');
      setLeads(Array.isArray(payload?.leads) ? payload.leads : []);
      const availableLocations = Array.isArray(payload?.locations) ? payload.locations : [];
      setLocations(availableLocations);
      setForm((current) => ({ ...current, location_id: current.location_id || availableLocations[0]?.id || '' }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load qualification tracking.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!profileLoading && canView) void loadLeads();
  }, [profileLoading, canView]);

  async function submitLead(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/qualifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(form) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to save the enquiry.');
      setForm({ ...emptyForm(), location_id: form.location_id });
      setShowForm(false);
      await loadLeads();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the enquiry.');
    } finally {
      setSaving(false);
    }
  }

  async function updateStage(lead: Lead, stage: string) {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, string> = { stage, event_date: today() };
      if (stage === 'completed' && !lead.completion_date) body.completion_date = today();
      const response = await fetch(`/api/qualifications/${lead.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to update the stage.');
      await loadLeads();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update the stage.');
    } finally {
      setSaving(false);
    }
  }

  async function addTimelineEvent(leadId: string, event: { event_type: string; event_date: string; note: string }) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/qualifications/${leadId}/timeline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(event) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to add the timeline update.');
      await loadLeads();
    } catch (timelineError) {
      setError(timelineError instanceof Error ? timelineError.message : 'Unable to add the timeline update.');
    } finally {
      setSaving(false);
    }
  }

  const filteredLeads = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesType = filterType === 'all' || lead.qualification_type === filterType;
      const matchesStage = filterStage === 'all' || lead.stage === filterStage;
      const matchesLocation = filterLocation === 'all' || lead.location_id === filterLocation;
      const matchesSearch = !searchValue || [lead.full_name, lead.qualification_name, lead.email, lead.phone].some((value) => String(value || '').toLowerCase().includes(searchValue));
      return matchesType && matchesStage && matchesLocation && matchesSearch;
    });
  }, [leads, filterType, filterStage, filterLocation, search]);

  const counts = useMemo(() => ({
    total: leads.length,
    active: leads.filter((lead) => !['completed', 'withdrawn'].includes(lead.stage)).length,
    completed: leads.filter((lead) => lead.stage === 'completed').length,
  }), [leads]);

  if (!profileLoading && !canView) {
    return <main className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950"><MainHeader title="NVQ & Diploma Tracker" backPath="/" /><div className="rounded-3xl border border-red-200 bg-red-50 p-6 font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">You do not have permission to view this tracker.</div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 transition-colors dark:bg-slate-950 md:p-8">
      <div className="mx-auto max-w-7xl">
        <MainHeader title="NVQ & Diploma Tracker" backPath="/" showThemeToggle={false} />
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Record each learner journey from first enquiry through course completion.</p></div>
          {canEdit && <UniformButton onClick={() => setShowForm((value) => !value)}>{showForm ? 'Close enquiry form' : 'New enquiry'}</UniformButton>}
        </div>

        {error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}

        {showForm && canEdit && (
          <form onSubmit={submitLead} className="mb-6 rounded-3xl border border-blue-200 bg-white p-5 shadow-sm dark:border-blue-900/60 dark:bg-slate-900 sm:p-6">
            <div className="mb-4"><h2 className="text-lg font-black text-slate-900 dark:text-white">Record an enquiry</h2><p className="text-sm text-slate-500 dark:text-slate-400">The first enquiry event is added to the timeline automatically.</p></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Location<select required value={form.location_id} onChange={(event) => setForm({ ...form, location_id: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Type<select value={form.qualification_type} onChange={(event) => setForm({ ...form, qualification_type: event.target.value as 'nvq' | 'diploma' })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="nvq">NVQ</option><option value="diploma">Diploma</option></select></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Course / qualification<input required value={form.qualification_name} onChange={(event) => setForm({ ...form, qualification_name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" placeholder="e.g. NVQ Level 3" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Learner name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Enquiry date<input required type="date" value={form.enquiry_date} onChange={(event) => setForm({ ...form, enquiry_date: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Target completion<input type="date" value={form.target_completion_date} onChange={(event) => setForm({ ...form, target_completion_date: event.target.value })} className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
              <label className="text-xs font-black uppercase tracking-wide text-slate-500 md:col-span-2 lg:col-span-1">Notes<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm normal-case text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>
            </div>
            <div className="mt-5 flex justify-end"><UniformButton type="submit" disabled={saving || !form.location_id}>{saving ? 'Saving…' : 'Save enquiry'}</UniformButton></div>
          </form>
        )}

        <div className="mb-6 grid grid-cols-3 gap-3 sm:gap-5"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total</p><p className="mt-1 text-3xl font-black text-slate-900 dark:text-white">{counts.total}</p></div><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-sm dark:border-blue-900 dark:bg-blue-950/30"><p className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-300">Active</p><p className="mt-1 text-3xl font-black text-blue-900 dark:text-blue-100">{counts.active}</p></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/30"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-300">Completed</p><p className="mt-1 text-3xl font-black text-emerald-900 dark:text-emerald-100">{counts.completed}</p></div></div>

        <section className="mb-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="grid gap-3 md:grid-cols-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search learner or qualification" className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /><select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="all">All types</option><option value="nvq">NVQ</option><option value="diploma">Diploma</option></select><select value={filterStage} onChange={(event) => setFilterStage(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="all">All stages</option>{stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select><select value={filterLocation} onChange={(event) => setFilterLocation(event.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option value="all">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></div></section>

        {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center font-bold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">Loading qualification tracker…</div> : filteredLeads.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">No enquiries match the current filters.</div> : <div className="space-y-4">{filteredLeads.map((lead) => { const expanded = expandedId === lead.id; const events = Array.isArray(lead.qualification_lead_timeline) ? lead.qualification_lead_timeline : []; return <article key={lead.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${lead.qualification_type === 'nvq' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}>{lead.qualification_type}</span><span className="text-xs font-bold text-slate-500 dark:text-slate-400">{locationName(lead)}</span></div><h2 className="mt-2 text-xl font-black text-slate-900 dark:text-white">{lead.full_name}</h2><p className="mt-1 font-semibold text-slate-600 dark:text-slate-300">{lead.qualification_name}</p>{(lead.email || lead.phone) && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{[lead.email, lead.phone].filter(Boolean).join(' · ')}</p>}</div><div className="flex flex-wrap items-center gap-2"><select value={lead.stage} disabled={!canEdit || saving} onChange={(event) => void updateStage(lead, event.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black uppercase text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">{stages.map((stage) => <option key={stage} value={stage}>{stageLabels[stage]}</option>)}</select><UniformButton variant="secondary" size="sm" onClick={() => setExpandedId(expanded ? null : lead.id)}>{expanded ? 'Hide timeline' : `View timeline (${events.length})`}</UniformButton></div></div><div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-xs dark:border-slate-800 sm:grid-cols-3"><div><span className="font-black uppercase tracking-wide text-slate-500">Enquiry</span><p className="mt-1 font-bold text-slate-800 dark:text-slate-200">{dateLabel(lead.enquiry_date)}</p></div><div><span className="font-black uppercase tracking-wide text-slate-500">Target completion</span><p className="mt-1 font-bold text-slate-800 dark:text-slate-200">{dateLabel(lead.target_completion_date)}</p></div><div><span className="font-black uppercase tracking-wide text-slate-500">Completed</span><p className="mt-1 font-bold text-slate-800 dark:text-slate-200">{dateLabel(lead.completion_date)}</p></div></div>{lead.notes && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">{lead.notes}</p>}</div>{expanded && <div className="border-t border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/40 sm:p-6"><QualificationTimeline events={events} onAdd={(event) => addTimelineEvent(lead.id, event)} saving={saving} /></div>}</article>; })}</div>}
      </div>
    </main>
  );
}
