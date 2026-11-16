'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import UniformButton from '@/app/components/UniformButton';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [expiredLink, setExpiredLink] = useState(false);

  useEffect(() => {
    setExpiredLink(new URLSearchParams(window.location.search).get('expired') === '1');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(result?.error || 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">Cascade Portal</h1>
        <h2 className="text-lg font-bold text-gray-800 text-center">Forgotten your password?</h2>

        {sent ? (
          <div className="mt-6 space-y-4 text-sm text-gray-700">
            <p className="rounded-xl bg-green-50 border border-green-200 p-4 text-green-900">
              If <strong>{email}</strong> belongs to a Cascade Portal account, we have sent it an email with a link to reset your password.
            </p>
            <p>The email comes from the Training Team. It can take a few minutes to arrive, so please check your junk or spam folder too.</p>
            <p>If nothing arrives, please contact the Training Team.</p>
            <p className="text-center pt-2">
              <Link href="/login" className="font-semibold text-blue-700 underline">Back to sign in</Link>
            </p>
          </div>
        ) : (
          <>
            {expiredLink && (
              <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                That password link has expired or has already been used. Please request a new one.
              </p>
            )}
            <p className="text-gray-500 text-center my-6 text-sm">
              Enter the email address you use to sign in and we will email you a link to choose a new password.
            </p>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-1">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
                />
              </div>
              {error && <p role="alert" className="text-center text-sm font-semibold text-red-600">{error}</p>}
              <UniformButton type="submit" disabled={loading} size="lg" className="w-full shadow-md">
                {loading ? 'Sending…' : 'Email me a reset link'}
              </UniformButton>
            </form>
            <p className="mt-6 text-center text-sm">
              <Link href="/login" className="text-blue-700 underline">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
