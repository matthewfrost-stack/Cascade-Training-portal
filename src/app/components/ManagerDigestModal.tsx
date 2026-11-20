'use client';

import { MANAGER_DIGEST_SCHEDULE_ON } from '@/lib/emailSwitches';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import UniformButton from './UniformButton';

type HomeStatus = {
  locationId: string;
  locationName: string;
  managerEmail: string | null;
  counts: { expired: number; missing: number; expiring: number; allocated: number };
  sentAt: string | null;
};

type StatusResponse = {
  period: string;
  lookaheadDays: number;
  fallbackInbox: string | null;
  homes: HomeStatus[];
  error?: string;
};

type SendResponse = {
  sent?: string[];
  alreadySent?: string[];
  failed?: { home: string; reason: string }[];
  testMode?: boolean;
  error?: string;
};

function monthLabel(period: string) {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The pop-up from Admin, or `inline` to show it inside the Emails & Feedback page. */
export default function ManagerDigestModal({ onClose, inline = false }: { onClose?: () => void; inline?: boolean }) {
  const [isDark, setIsDark] = useState(true);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);

  useEffect(() => {
    try {
      const theme = localStorage.getItem('theme');
      setIsDark(theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
    } catch {
      // keep default
    }
    const handleThemeChange = (event: Event) => {
      const detail = (event as CustomEvent<{ isDark?: boolean }>).detail;
      if (typeof detail?.isDark === 'boolean') setIsDark(detail.isDark);
    };
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/automations/manager-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const body = (await response.json().catch(() => ({}))) as StatusResponse;
      if (!response.ok) throw new Error(body.error || 'Could not load the homes.');
      setStatus(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the homes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const sendPreview = async (home: HomeStatus) => {
    setBusyId(home.locationId);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/automations/manager-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', locationId: home.locationId }),
      });
      const body = (await response.json().catch(() => ({}))) as { sentTo?: string; error?: string };
      if (!response.ok) throw new Error(body.error || 'Preview could not be sent.');
      setNotice(`Preview for ${home.locationName} sent to ${body.sentTo}. Nothing was sent to the managers.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Preview could not be sent.');
    } finally {
      setBusyId(null);
    }
  };

  const sendAll = async () => {
    if (!status) return;
    const waiting = status.homes.filter((home) => !home.sentAt).length;
    if (waiting === 0) {
      setNotice(`Every home has already had its ${monthLabel(status.period)} email.`);
      return;
    }
    if (!window.confirm(`Send the ${monthLabel(status.period)} email to ${waiting} home${waiting === 1 ? '' : 's'} now?\n\nHomes that have already had this month's email will be skipped.`)) return;

    setSendingAll(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/automations/manager-digest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send' }),
      });
      const body = (await response.json().catch(() => ({}))) as SendResponse;
      if (!response.ok && !body.sent?.length) throw new Error(body.error || body.failed?.map((f) => `${f.home}: ${f.reason}`).join('; ') || 'Sending failed.');
      const parts = [`Sent to ${body.sent?.length || 0} home${body.sent?.length === 1 ? '' : 's'}.`];
      if (body.failed?.length) parts.push(`Failed: ${body.failed.map((f) => f.home).join(', ')}.`);
      if (body.testMode) parts.push('Email test mode is on, so these went to the test address and were not marked as sent.');
      setNotice(parts.join(' '));
      await loadStatus();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Sending failed.');
    } finally {
      setSendingAll(false);
    }
  };

  const muted = isDark ? '#94a3b8' : '#64748b';
  const strong = isDark ? '#f1f5f9' : '#1e293b';
  const rowBg = isDark ? '#0f172a' : '#f1f5f9';
  const border = isDark ? '#334155' : '#e2e8f0';
  const missingEmail = status?.homes.filter((home) => !home.managerEmail) || [];

  return (
    <div className={inline ? '' : 'fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50'} role={inline ? undefined : 'dialog'} aria-modal={inline ? undefined : true} aria-labelledby="manager-digest-title">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className={inline ? 'rounded-2xl p-5 w-full flex flex-col shadow-sm border' : 'rounded-3xl p-6 sm:p-8 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border'}>
        <div className="flex justify-between items-start mb-2 gap-4">
          <div>
            <h2 id="manager-digest-title" style={{ color: strong }} className={inline ? 'text-lg font-black' : 'text-2xl font-black uppercase tracking-tight'}>Manager Emails</h2>
            <p style={{ color: muted }} className="text-sm mt-1">
              On the 1st of each month at 7am, each home&rsquo;s managers get one email listing training that has expired, has never been completed, expires in the next {status?.lookaheadDays ?? 60} days, or is allocated but not done.
              {!MANAGER_DIGEST_SCHEDULE_ON && <strong> The automatic monthly send is paused at the moment; previews and “Send now” still work.</strong>}
            </p>
          </div>
          {!inline && onClose && (
            <button onClick={onClose} style={{ color: muted }} className="hover:text-red-500 transition-colors" aria-label="Close">
              <Icon name="close" className="w-6 h-6" />
            </button>
          )}
        </div>

        {error && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${isDark ? 'border-red-900/40 bg-red-950/30 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>{error}</div>
        )}
        {notice && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${isDark ? 'border-emerald-900/40 bg-emerald-950/20 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice}</div>
        )}
        {missingEmail.length > 0 && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${isDark ? 'border-amber-900/40 bg-amber-950/20 text-amber-200' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {missingEmail.length} home{missingEmail.length === 1 ? ' has' : 's have'} no managers&rsquo; email yet, so {missingEmail.length === 1 ? 'its email goes' : 'their emails go'} to the training inbox{status?.fallbackInbox ? ` (${status.fallbackInbox})` : ''}. Add the Google Group address in <strong>Admin → Manage Venues</strong>.
          </div>
        )}

        <div className={inline ? 'mt-4 space-y-2' : 'mt-4 flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar'}>
          {loading && <p style={{ color: muted }} className="text-sm text-center py-8">Working out each home&rsquo;s training…</p>}
          {!loading && status?.homes.length === 0 && <p style={{ color: muted }} className="text-sm text-center py-8">No homes found.</p>}
          {!loading && status?.homes.map((home) => {
            const total = home.counts.expired + home.counts.missing + home.counts.expiring + home.counts.allocated;
            return (
              <div key={home.locationId} style={{ backgroundColor: rowBg, borderColor: border }} className="p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="min-w-0">
                  <p style={{ color: strong }} className="font-bold">{home.locationName}</p>
                  <p style={{ color: home.managerEmail ? muted : '#d97706' }} className="text-xs mt-0.5 truncate">
                    📧 {home.managerEmail || 'No managers’ email – goes to training inbox'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs font-bold">
                    {total === 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">✅ All up to date</span>
                    ) : (
                      <>
                        <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">{home.counts.expired} expired</span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-500/20" style={{ color: strong }}>{home.counts.missing} never completed</span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-500">{home.counts.expiring} expiring</span>
                        <span className="px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-600">{home.counts.allocated} allocated</span>
                      </>
                    )}
                    {home.sentAt && (
                      <span style={{ color: muted }} className="px-2 py-0.5">
                        Sent {new Date(home.sentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
                <UniformButton
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void sendPreview(home)}
                  disabled={busyId !== null || sendingAll}
                >
                  {busyId === home.locationId ? 'Sending…' : '👁️ Send me a preview'}
                </UniformButton>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p style={{ color: muted }} className="text-xs">
            A preview only goes to you. Each home gets one email per month, even if sending is run again.
          </p>
          <UniformButton variant="primary" className="shrink-0" onClick={() => void sendAll()} disabled={loading || sendingAll || busyId !== null || !status}>
            {sendingAll ? 'Sending…' : status ? `Send ${monthLabel(status.period)} emails now` : 'Send now'}
          </UniformButton>
        </div>
      </div>
    </div>
  );
}
