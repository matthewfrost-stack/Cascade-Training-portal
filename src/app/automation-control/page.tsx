'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import FeedbackManagerModal from '@/app/components/FeedbackManagerModal';

export default function AutomationControlPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runAuthCheck = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Auth check error:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    runAuthCheck();
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-sm font-bold text-slate-300">Loading…</p>
      </main>
    );
  }

  return <FeedbackManagerModal onClose={() => router.push('/admin')} />;
}

