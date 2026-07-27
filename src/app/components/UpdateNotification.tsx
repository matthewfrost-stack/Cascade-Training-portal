'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';

export default function UpdateNotification() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const initialVersionRef = useRef<string | null>(null);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const latestVersion = data.version;

      if (!latestVersion) return;

      if (initialVersionRef.current === null) {
        initialVersionRef.current = latestVersion;
      } else if (
        initialVersionRef.current !== latestVersion &&
        latestVersion !== 'development' &&
        initialVersionRef.current !== 'development'
      ) {
        setHasUpdate(true);
      }
    } catch (err) {
      // Silently ignore network errors during version check
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    checkVersion();

    // Check every 3 minutes (180,000 ms)
    const interval = setInterval(checkVersion, 180000);

    // Check when user switches back to the tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkVersion]);

  const handleRefresh = () => {
    window.location.reload();
  };

  if (!hasUpdate || dismissed) {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9999] max-w-md w-full sm:w-auto min-w-[320px] p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 dark:border-indigo-500/40 rounded-2xl shadow-2xl shadow-indigo-500/10 text-slate-900 dark:text-white transition-all duration-300 transform animate-in fade-in slide-in-from-bottom-6"
    >
      <div className="flex items-start gap-3.5">
        {/* Animated Update Icon */}
        <div className="relative flex-shrink-0 mt-0.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
            <svg
              className="w-5 h-5 animate-spin-slow"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
          </span>
        </div>

        {/* Text Content */}
        <div className="flex-1 pr-2">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            App Update Available
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            A new version has been deployed. Refresh now to get the latest improvements.
          </p>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleRefresh}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs rounded-lg transition-all shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh Now
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
