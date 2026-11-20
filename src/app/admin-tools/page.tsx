'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The separate Admin Tools page was merged into /admin (2026-11-20).
 * Old links (including ?open=staff / notifications) are forwarded there.
 */
export default function AdminToolsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/admin${window.location.search}`);
  }, [router]);
  return (
    <main className="min-h-screen px-4 py-8">
      <div className="max-w-5xl mx-auto text-sm text-slate-600">Opening Admin…</div>
    </main>
  );
}
