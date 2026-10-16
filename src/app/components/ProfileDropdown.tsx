'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ChangePasswordModal from './ChangePasswordModal';
import type { User } from '@supabase/supabase-js';

interface ProfileDropdownProps {
  user: User | null;
  isDark?: boolean;
}

export default function ProfileDropdown({ user, isDark = true }: ProfileDropdownProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, [user]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-3 py-2 rounded transition-colors ${
            isDark
              ? 'bg-slate-700 hover:bg-slate-600 text-white'
              : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
          }`}
          aria-label="User menu"
        >
          <span className="text-sm truncate max-w-[150px]">{userEmail}</span>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </button>

        {isOpen && (
          <div
            className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-50 ${
              isDark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
            }`}
          >
            <button
              onClick={() => {
                setShowChangePassword(true);
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 hover:bg-slate-700 dark:hover:bg-slate-700 transition-colors ${
                isDark ? 'hover:bg-slate-700' : 'hover:bg-slate-100'
              }`}
            >
              Change Password
            </button>
            <hr className={isDark ? 'border-slate-700' : 'border-slate-200'} />
            <button
              onClick={handleSignOut}
              className={`w-full text-left px-4 py-2 hover:bg-red-600 hover:text-white transition-colors ${
                isDark ? 'hover:bg-red-600' : 'hover:bg-red-100 hover:text-red-700'
              }`}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      {showChangePassword && user && (
        <ChangePasswordModal
          onClose={() => setShowChangePassword(false)}
          onSuccess={() => {
            // Optional: show success message or refresh
          }}
        />
      )}
    </>
  );
}
