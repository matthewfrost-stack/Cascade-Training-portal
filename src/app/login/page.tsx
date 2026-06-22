'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from './actions';
import UniformButton from '@/app/components/UniformButton';

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Unable to sign in right now.';
}

export default function SignInPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'error' | 'info'>('error');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error === 'account_deleted') {
      setMessage('Your account has been deactivated. Please contact an administrator.');
      setMessageType('error');
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setMessageType('error');

    const formData = new FormData(event.currentTarget);
    try {
      const result = await login(formData); // Call the server action

      if (result?.error) {
        setMessage(result.error);
        setMessageType('error');
        return;
      }
      router.replace('/');
    } catch (error: unknown) {
      setMessage(getErrorMessage(error));
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-gray-100">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">Cascade Portal</h1>
        <p className="text-gray-500 text-center mb-8 italic">Sign in to continue</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Email Address</label>
            <input
              name="email"
              type="email"
              required
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Password</label>
            <input
              name="password"
              type="password"
              required
              className="w-full p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition text-black"
            />
          </div>

          <UniformButton
            type="submit"
            disabled={loading}
            size="lg"
            className="w-full shadow-md"
          >
            {loading ? 'Logging in...' : 'Sign In'}
          </UniformButton>
        </form>

        {message && (
          <p className={`mt-4 text-center text-sm font-semibold ${messageType === 'error' ? 'text-red-500' : 'text-blue-600'}`}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
