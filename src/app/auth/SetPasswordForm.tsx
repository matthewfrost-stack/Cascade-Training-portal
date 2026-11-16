'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import UniformButton from '@/app/components/UniformButton';

interface SetPasswordFormProps {
  title: string;
  subtitle: string;
}

const MIN_LENGTH = 8;

function friendlyError(message: string): string {
  if (/different from the old password/i.test(message)) {
    return 'Your new password must be different from your current password.';
  }
  if (/session|jwt|not authenticated|auth session missing/i.test(message)) {
    return 'Your session has expired. Please request a new password email.';
  }
  return message;
}

/**
 * Shared "choose a new password" form, used by /auth/set-password (from an
 * emailed link) and /auth/change-password-required (temporary passwords).
 * The person must already be signed in: the emailed link signs them in on
 * /auth/confirm before sending them here.
 */
export default function SetPasswordForm({ title, subtitle }: SetPasswordFormProps) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setHasSession(Boolean(data.user)));
  }, []);

  const longEnough = newPassword.length >= MIN_LENGTH;
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!longEnough) {
      setError(`Your password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (!matches) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(friendlyError(updateError.message));
        return;
      }

      // Clear the "must change password" flag (RLS blocks a direct self-update).
      const profileRes = await fetch('/api/auth/complete-password-change', { method: 'POST' });
      if (!profileRes.ok) {
        const result = await profileRes.json().catch(() => ({}));
        throw new Error(result?.error || 'Your password was changed, but your profile could not be updated. Please contact the Training Team.');
      }

      setDone(true);
      // The proxy re-reads the profile on navigation and sends each role to
      // the right home page.
      window.setTimeout(() => {
        router.replace('/');
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-black';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">Cascade Portal</h1>
        <h2 className="text-lg font-bold text-gray-800 text-center">{title}</h2>
        <p className="text-gray-500 text-center mb-6 text-sm">{subtitle}</p>

        {hasSession === false && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
            <p className="font-semibold mb-1">This page needs a valid password link.</p>
            <p>
              Your link may have expired or already been used.{' '}
              <Link href="/auth/forgot-password" className="font-semibold text-blue-700 underline">
                Request a new password email
              </Link>
              .
            </p>
          </div>
        )}

        {done && (
          <p className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm font-semibold text-green-800 text-center">
            Password saved. Signing you in…
          </p>
        )}

        {hasSession !== false && !done && (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="new-password" className="block text-sm font-bold text-gray-700 mb-1">
                New password
              </label>
              <input
                id="new-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-bold text-gray-700 mb-1">
                Confirm new password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show passwords
            </label>

            <ul className="text-sm space-y-1">
              <li className={longEnough ? 'text-green-700' : 'text-gray-500'}>
                {longEnough ? '✓' : '•'} At least {MIN_LENGTH} characters
              </li>
              <li className={matches ? 'text-green-700' : 'text-gray-500'}>
                {matches ? '✓' : '•'} Both passwords match
              </li>
            </ul>

            {error && (
              <p role="alert" className="text-center text-sm font-semibold text-red-600">
                {error}
              </p>
            )}

            <UniformButton type="submit" disabled={loading || hasSession === null} size="lg" className="w-full shadow-md">
              {loading ? 'Saving…' : 'Save password and sign in'}
            </UniformButton>
          </form>
        )}
      </div>
    </div>
  );
}
