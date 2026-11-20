'use client';

import { useCallback, useEffect, useState } from 'react';
import UniformButton from '@/app/components/UniformButton';
import { loadEmailTestSettings, saveEmailTestSettings } from '@/lib/emailTestMode';

type EmailLogItem = {
  id: string;
  created_at: string;
  subject: string;
  status: 'sent' | 'failed';
  test_mode: boolean;
  provider: string | null;
  error_text: string | null;
  delivered_recipients: string[];
};

const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';
const input = 'w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

/**
 * Email test mode (saved in this browser) and the recent sent-email log.
 * Moved here from the old Admin Tools "Notifications" pop-up.
 */
export default function EmailTestAndLog({ onTestModeChange }: { onTestModeChange?: (on: boolean) => void }) {
  const [testMode, setTestMode] = useState(false);
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState<EmailLogItem[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    const saved = loadEmailTestSettings();
    setTestMode(saved.enabled);
    setAddress(saved.address);
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const response = await fetch('/api/email-logs?limit=30');
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch email logs:', error);
    } finally {
      setLogsLoading(false);
    }
  }, []);
  useEffect(() => { void fetchLogs(); }, [fetchLogs]);

  const save = () => {
    saveEmailTestSettings({ enabled: testMode, address });
    onTestModeChange?.(testMode);
    setMessage({ type: 'ok', text: `Test mode ${testMode ? 'switched on' : 'switched off'} for this browser.` });
  };

  const sendTest = async () => {
    const target = address.trim();
    if (!target) { setMessage({ type: 'error', text: 'Enter a test email address first.' }); return; }
    setSending(true);
    setMessage(null);
    try {
      const res = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-email-test-mode': testMode ? 'true' : 'false', 'x-test-email-address': target },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'error', text: `Failed to send test email${data?.provider ? ` via ${data.provider}` : ''}${data?.details ? ` (${String(data.details)})` : ''}` });
        return;
      }
      setMessage({ type: 'ok', text: `Test email sent${data?.provider ? ` via ${data.provider}` : ''}${data?.test_mode ? ' (TEST MODE)' : ''}` });
      void fetchLogs();
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to send test email (${String(error)})` });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className={`${card} p-5 space-y-3`}>
        <h3 className="font-black">Email test mode <span className="text-xs font-semibold text-slate-500">(this browser only)</span></h3>
        <p className="text-sm text-slate-500">When on, emails you send by hand from this browser (e.g. from the Booking Calendar) go to the address below instead of the real people. It doesn&rsquo;t affect the automatic emails.</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="w-4 h-4" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} />
          Test mode on
        </label>
        <input type="email" aria-label="Test email address" className={`${input} max-w-md`} placeholder="test@yourdomain.com" value={address} onChange={(e) => setAddress(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <UniformButton variant="primary" size="sm" onClick={save}>Save</UniformButton>
          <UniformButton variant="secondary" size="sm" onClick={() => void sendTest()} disabled={sending}>{sending ? 'Sending…' : 'Send a test email'}</UniformButton>
          {message && <p className={`text-sm font-semibold ${message.type === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
        </div>
      </section>

      <section className={`${card} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black">Sent emails – latest 30</h3>
          <UniformButton variant="secondary" size="sm" onClick={() => void fetchLogs()} disabled={logsLoading}>Refresh</UniformButton>
        </div>
        {logsLoading ? <p className="text-sm text-slate-500">Loading…</p>
          : logs.length === 0 ? <p className="text-sm text-slate-500">No emails sent yet.</p>
          : (
            <ul className="space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold truncate">{log.subject}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase text-white ${log.status === 'sent' ? 'bg-emerald-600' : 'bg-red-600'}`}>{log.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(log.created_at).toLocaleString('en-GB')} · {log.provider || 'unknown provider'}{log.test_mode ? ' · TEST MODE' : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">To: {(log.delivered_recipients || []).join(', ') || '–'}</p>
                  {log.error_text && <p className="text-xs mt-1 text-red-600 dark:text-red-400 truncate">Error: {log.error_text}</p>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
