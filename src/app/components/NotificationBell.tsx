'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/app/components/Icon';
import { supabase } from '@/lib/supabase';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
};

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isMissingNotificationsTableError(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;

  const code = error.code?.toUpperCase() || '';
  const message = error.message?.toLowerCase() || '';

  return code === 'PGRST205'
    || code === '42P01'
    || message.includes('does not exist')
    || message.includes('notifications');
}

export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { profile, isAuthenticated } = useCurrentUserProfile();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const userId = profile?.id || null;
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.is_read).length,
    [notifications]
  );

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, title, body, is_read, created_at, link')
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        // The bell remains available while a deployment is waiting for the
        // notification migration; avoid turning that into a noisy UI error.
        if (isMissingNotificationsTableError(error)) {
          setNotifications([]);
          return;
        }
        setNotifications([]);
        return;
      }

      setNotifications((data || []) as NotificationItem[]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  useEffect(() => {
    void loadNotifications();

    if (!isAuthenticated || !userId) return;

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadNotifications();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, loadNotifications, userId]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const markAsRead = async (notification: NotificationItem) => {
    if (notification.is_read) return;

    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, is_read: true } : item
    )));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notification.id)
      .eq('recipient_user_id', userId);

    if (error) void loadNotifications();
  };

  const markAllAsRead = async () => {
    if (!userId || unreadCount === 0) return;

    setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_user_id', userId)
      .eq('is_read', false);

    if (error) void loadNotifications();
  };

  const handleNotificationClick = async (notification: NotificationItem) => {
    await markAsRead(notification);
    setIsOpen(false);
    if (notification.link?.startsWith('/')) router.push(notification.link);
  };

  if (!isAuthenticated || !userId) return null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="notification-bell"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black leading-4 text-white ring-2 ring-white dark:ring-slate-950">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100" role="menu">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <p className="text-sm font-bold">Notifications</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {unreadCount ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-xs font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading notifications…</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void handleNotificationClick(notification)}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-800/80 dark:hover:bg-slate-900 ${notification.is_read ? '' : 'bg-blue-50/60 dark:bg-blue-950/20'}`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />}
                    <span className={notification.is_read ? 'ml-4 min-w-0' : 'min-w-0'}>
                      <span className="block text-sm font-semibold">{notification.title}</span>
                      {notification.body && <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{notification.body}</span>}
                      <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">{formatNotificationTime(notification.created_at)}</span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
