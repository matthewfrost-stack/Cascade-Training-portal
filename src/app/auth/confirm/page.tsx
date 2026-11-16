'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import UniformButton from '@/app/components/UniformButton';

type LinkState = 'checking' | 'ready' | 'invalid';

/**
 * Landing page for emailed password links.
 *
 * The one-time token is only used when the person presses the button, never
 * on page load. Email security scanners (e.g. Outlook Safe Links) open every
 * link in an email; if loading this page used the token, it would already be
 * spent by the time the person clicked it.
 */
export default function ConfirmPasswordLinkPage() {
  const router = useRouter();
  const [tokenHash, setTokenHash] = useState('');
  const [linkState, setLinkState] = useState<LinkState>('checking');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = params.get('token_hash') || '';
    const type = params.get('type');
    setTokenHash(hash);
    setLinkState(hash && type === 'recovery' ? 'ready' : 'invalid');
  }, []);

  const handleContinue = async () => {
    setLoading(true);
    setError('');
    try {
      // Sign out any other account that is open in this browser first, so
      // the password is set for the person the email was sent to.
      await supabase.auth.signOut({ scope: 'local' });
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (verifyError) {
        setLinkState('invalid');
        return;
      }
      router.replace('/auth/set-password');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100 text-center">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Cascade Portal</h1>

        {linkState === 'ready' && (
          <>
            <h2 className="text-lg font-bold text-gray-800">Set your password</h2>
            <p className="text-gray-500 text-sm mb-6">
              Select the button below to choose a new password for your account.
            </p>
            <UniformButton type="button" size="lg" className="w-full shadow-md" disabled={loading} onClick={handleContinue}>
              {loading ? 'Checking link…' : 'Set my password'}
            </UniformButton>
            {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
          </>
        )}

        {linkState === 'invalid' && (
          <>
            <h2 className="text-lg font-bold text-gray-800">This link has expired</h2>
            <p className="text-gray-600 text-sm mb-6">
              Password links can only be used once and expire after a short time. You can request a new one below.
            </p>
            <Link
              href="/auth/forgot-password"
              className="inline-block w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
            >
              Request a new password email
            </Link>
            <p className="mt-4 text-sm">
              <Link href="/login" className="text-blue-700 underline">Back to sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
