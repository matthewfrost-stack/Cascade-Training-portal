'use client';

import { useNavDrawer } from '@/app/components/NavDrawerProvider';
import { usePathname, useRouter } from 'next/navigation';
import Icon from './Icon';
import UniformButton from './UniformButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getProfileAvatarUrl, getProfileInitials } from '@/lib/profile';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

type ThemeMode = 'light' | 'dark' | 'system';
type RoleTier = 'staff' | 'manager' | 'scheduler' | 'admin';

type ITReferralNotificationRow = {
  id: string;
  ticket_number?: number | null;
  issue_title: string;
  created_at: string;
  requester_user_id?: string | null;
};

type TicketUpdateNotificationRow = {
  id: string;
  referral_id: string;
  updated_by: string;
  update_text: string;
  author_user_id?: string | null;
  created_at: string;
};

type NotificationItem = {
  id: string;
  createdAt: string;
  title: string;
  description: string;
};

type HeaderProfileRow = {
  full_name?: string | null;
  email?: string | null;
  role_tier?: RoleTier | null;
  avatar_path?: string | null;
};

function getStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const theme = localStorage.getItem('theme');
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeMode(mode: ThemeMode) {
  const useDark = mode === 'dark' || (mode === 'system' && systemPrefersDark());

  if (useDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  if (mode === 'system') {
    localStorage.removeItem('theme');
  } else {
    localStorage.setItem('theme', mode);
  }

  window.dispatchEvent(new CustomEvent('themeChange', { detail: { isDark: useDark, mode } }));
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const minutes = Math.round(diffMs / (1000 * 60));
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(days, 'day');
}

export default function FixedHeader() {
  const pathname = usePathname();
  const { toggle } = useNavDrawer();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const { profile, isAuthenticated, loading, refreshProfile } = useCurrentUserProfile();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string>('1970-01-01T00:00:00.000Z');
  const currentUserId = profile?.id || null;
  const roleTier = (profile?.role_tier as RoleTier | null) || null;
  const fullName = profile?.full_name || '';
  const email = profile?.email || '';
  const avatarPath = profile?.avatar_path || null;
  const avatarUrl = useMemo(
    () => getProfileAvatarUrl(avatarPath, process.env.NEXT_PUBLIC_SUPABASE_URL),
    [avatarPath]
  );

  // Auto-refresh profile if role_tier is missing when authenticated
  useEffect(() => {
    if (isAuthenticated && !loading && profile && !roleTier && currentUserId) {
      console.log('Profile loaded but role_tier is missing, refreshing...');
      refreshProfile();
    }
  }, [isAuthenticated, loading, profile, roleTier, currentUserId, refreshProfile]);

  useEffect(() => {
    setThemeMode(getStoredThemeMode());

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemThemeChange = () => {
      if (getStoredThemeMode() === 'system') {
        applyThemeMode('system');
        setThemeMode('system');
      }
    };

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: ThemeMode }>;
      if (customEvent.detail?.mode) {
        setThemeMode(customEvent.detail.mode);
        return;
      }
      setThemeMode(getStoredThemeMode());
    };

    media.addEventListener('change', handleSystemThemeChange);
    window.addEventListener('themeChange', handleThemeChange as EventListener);

    return () => {
      media.removeEventListener('change', handleSystemThemeChange);
      window.removeEventListener('themeChange', handleThemeChange as EventListener);
    };
  }, []);

  useEffect(() => {
    setIsProfileDropdownOpen(false);
    setIsNotificationsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileDropdownOpen(false);
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!currentUserId || !roleTier) {
      setLastSeenAt('1970-01-01T00:00:00.000Z');
      return;
    }

    const key = `it-ticket-notifications-last-seen:${currentUserId}:${roleTier}`;
    setLastSeenAt(localStorage.getItem(key) || '1970-01-01T00:00:00.000Z');
  }, [currentUserId, roleTier]);

  useEffect(() => {
    if (!isAuthenticated || !currentUserId || !roleTier) return;

    let active = true;

    const loadNotifications = async () => {
      try {
        setNotificationsLoading(true);

        const { data: referralsData, error: referralsError } = await supabase
          .from('it_referrals')
          .select('id, ticket_number, issue_title, created_at, requester_user_id')
          .order('created_at', { ascending: false })
          .limit(20);

        if (referralsError) throw referralsError;

        const { data: updatesData, error: updatesError } = await supabase
          .from('ticket_updates')
          .select('id, referral_id, updated_by, update_text, author_user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(40);

        if (updatesError) throw updatesError;

        const relevantNotifications: NotificationItem[] = [];
        const referrals = (referralsData || []) as ITReferralNotificationRow[];
        const updates = (updatesData || []) as TicketUpdateNotificationRow[];
        const referralMap = new Map(referrals.map((referral) => [referral.id, referral]));

        if (roleTier === 'admin') {
          referrals.forEach((referral) => {
            relevantNotifications.push({
              id: `referral-${referral.id}`,
              createdAt: referral.created_at,
              title: `New ticket #${referral.ticket_number ?? '—'}`,
              description: referral.issue_title,
            });
          });
        }

        updates.forEach((update) => {
          const referral = referralMap.get(update.referral_id);
          const isOwnUpdate = update.author_user_id
            ? update.author_user_id === currentUserId
            : update.updated_by === fullName;

          if (!referral || isOwnUpdate) return;

          relevantNotifications.push({
            id: `update-${update.id}`,
            createdAt: update.created_at,
            title: roleTier === 'admin'
              ? `Ticket #${referral.ticket_number ?? '—'} updated`
              : `Update on ticket #${referral.ticket_number ?? '—'}`,
            description: update.update_text,
          });
        });

        relevantNotifications.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        if (active) {
          setNotifications(relevantNotifications.slice(0, 20));
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : error
            ? JSON.stringify(error)
            : 'Unknown error';
        const isMissingNotificationsTable = /PGRST205|Could not find the table|does not exist/i.test(errorMessage);

        if (isMissingNotificationsTable) {
          if (active) setNotifications([]);
          return;
        }

        console.error('Error loading notifications:', errorMessage, error);
        if (active) setNotifications([]);
      } finally {
        if (active) setNotificationsLoading(false);
      }
    };

    loadNotifications();
    const interval = window.setInterval(loadNotifications, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUserId, fullName, isAuthenticated, roleTier]);

  useEffect(() => {
    if (!isNotificationsOpen || !currentUserId || !roleTier) return;

    const now = new Date().toISOString();
    const key = `it-ticket-notifications-last-seen:${currentUserId}:${roleTier}`;
    localStorage.setItem(key, now);
    setLastSeenAt(now);
  }, [currentUserId, isNotificationsOpen, roleTier]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => new Date(item.createdAt).getTime() > new Date(lastSeenAt).getTime()).length,
    [lastSeenAt, notifications]
  );

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      return;
    }
    setIsProfileDropdownOpen(false);
    setIsNotificationsOpen(false);
    router.push('/login');
  };

  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  if (pathname === '/login' || pathname === '/auth/callback') {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <UniformButton
          variant="secondary"
          className="no-ui-motion border p-2 shadow-sm"
          onClick={toggle}
          title="Menu"
          aria-label="Menu"
        >
          <Icon name="menu" className="h-6 w-6" />
        </UniformButton>

        <div className="flex-1" />

        <div className="relative flex items-center gap-2" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              setIsNotificationsOpen((open) => !open);
              setIsProfileDropdownOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
            aria-label="Notifications"
            title="Notifications"
          >
            <Icon name="bell" className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                <h4 className="font-semibold">Notifications</h4>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUserId || !roleTier) return;
                      const now = new Date().toISOString();
                      const key = `it-ticket-notifications-last-seen:${currentUserId}:${roleTier}`;
                      localStorage.setItem(key, now);
                      setLastSeenAt(now);
                    }}
                    className="text-xs text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Mark read
                  </button>
                )}
              </div>

              <div className="h-[360px] overflow-y-auto">
                {notificationsLoading ? (
                  <div className="flex h-full items-center justify-center p-4 text-sm text-slate-500 dark:text-slate-400">
                    Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center text-slate-500 dark:text-slate-400">
                    <Icon name="bell" className="mb-2 h-8 w-8 opacity-20" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {notifications.map((notification) => {
                      const isUnread = new Date(notification.createdAt).getTime() > new Date(lastSeenAt).getTime();
                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => {
                            setIsNotificationsOpen(false);
                            router.push('/apps/it-referral-dashboard');
                          }}
                          className={`flex w-full flex-col items-start gap-1 px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-900 ${
                            isUnread ? 'bg-slate-50 dark:bg-slate-900/40' : ''
                          }`}
                        >
                          <div className="flex w-full items-center justify-between gap-3">
                            <span className="text-sm font-medium">{notification.title}</span>
                            <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                            {notification.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setIsProfileDropdownOpen((open) => !open);
              setIsNotificationsOpen(false);
            }}
            className="flex items-center gap-2 text-left"
            aria-haspopup="menu"
            aria-expanded={isProfileDropdownOpen}
          >
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium leading-none text-slate-900 dark:text-white">
                {loading ? 'Loading...' : fullName || email || 'Profile'}
              </p>
              <p className="mt-1 truncate text-xs capitalize leading-none text-slate-500 dark:text-slate-400">
                {roleTier || 'User'}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-black text-slate-700 shadow-inner dark:bg-[#1b2740] dark:text-slate-100">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span>{getProfileInitials(fullName, email)}</span>
              )}
            </div>
          </button>

          {isProfileDropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              <div className="px-2 py-1.5 text-sm font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{fullName || email || 'Profile'}</p>
                  {email ? <p className="text-xs leading-none text-slate-500 dark:text-slate-400">{email}</p> : null}
                  <p className="text-xs capitalize leading-none text-slate-500 dark:text-slate-400">{roleTier || 'User'}</p>
                </div>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    router.push('/');
                  }}
                  className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <Icon name="home" className="h-4 w-4" />
                  <span className="ml-2">Home</span>
                </button>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    router.push('/profile');
                  }}
                  className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <Icon name="user" className="h-4 w-4" />
                  <span className="ml-2">My Profile</span>
                </button>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div className="px-2 py-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                Theme
              </div>

              <div>
                <div className="space-y-1">
                  {[
                    { mode: 'light' as const, label: 'Light', icon: 'sun' as const },
                    { mode: 'dark' as const, label: 'Dark', icon: 'moon' as const },
                    { mode: 'system' as const, label: 'System', icon: 'monitor' as const },
                  ].map((option) => {
                    const active = themeMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => handleSelectTheme(option.mode)}
                        className={`flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
                          active
                            ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white'
                            : 'text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-900'
                        }`}
                      >
                        <Icon name={option.icon} className="h-4 w-4" />
                        <span className="ml-2 flex-1 text-left">{option.label}</span>
                        {active && <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              {!loading && isAuthenticated && (
                <div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                  >
                    <Icon name="logout" className="h-4 w-4" />
                    <span className="ml-2">Log out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
