'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface ArchiveItem {
  id: string;
  entity_type: string;
  entity_id: string;
  location_id: string | null;
  location_name: string | null;
  snapshot: Record<string, unknown>;
  deleted_by: string | null;
  deleted_at: string;
}

export default function ArchivePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isDark, setIsDark] = useState(true);
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [openDates, setOpenDates] = useState<Record<string, boolean>>({});
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role_tier')
        .eq('id', userData.user.id)
        .single();

      if (profile?.role_tier !== 'admin') {
        router.push('/');
        return;
      }

      const dark = document.documentElement.classList.contains('dark');
      setIsDark(dark);
      await loadItems();
      setLoading(false);
    };

    init();
  }, [router]);

  async function loadItems() {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) return;

    const response = await fetch('/api/archive', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json();
    if (response.ok && Array.isArray(result?.items)) {
      setItems(result.items);
    }
  }

  async function restoreItem(id: string) {
    setRestoringId(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You are not authenticated');

      const response = await fetch('/api/archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deletedItemId: id }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to restore item');
      }
      await loadItems();
    } catch (error: any) {
      alert(`Restore failed: ${error.message}`);
    } finally {
      setRestoringId(null);
    }
  }

  async function deleteArchiveItem(id: string) {
    if (!confirm('Delete this archive entry permanently?')) return;

    setDeletingId(id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('You are not authenticated');

      const response = await fetch('/api/archive', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deletedItemId: id }),
      });
      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to delete archive entry');
      }
      await loadItems();
    } catch (error: any) {
      alert(`Delete failed: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  function itemTitle(item: ArchiveItem): string {
    if (item.entity_type === 'location_training_course') {
      return (item?.snapshot as { course_name?: string })?.course_name || 'Removed Matrix Course';
    }
    if (item.entity_type === 'booking') {
      return 'Deleted Booking';
    }
    if (item.entity_type === 'profile') {
      return (item?.snapshot as { profile?: { full_name?: string } })?.profile?.full_name || 'Deleted Profile';
    }
    return item.entity_type;
  }

  function dayKey(iso: string): string {
    const date = new Date(iso);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const groupedItems = items.reduce<Record<string, ArchiveItem[]>>((acc, item) => {
    const key = dayKey(item.deleted_at);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const groupedDates = Object.keys(groupedItems).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return <div className={`p-8 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>Loading archive...</div>;
  }

  return (
    <main className={`min-h-screen p-4 pt-20 sm:p-8 sm:pt-24 ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div className="w-10" />
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Archive</h1>
          <button
            onClick={loadItems}
            className="px-3 py-2 rounded font-semibold bg-blue-600 hover:bg-blue-700 text-white"
          >
            Refresh
          </button>
        </div>

        {items.length === 0 ? (
          <div className={`rounded-lg border p-6 text-center ${isDark ? 'border-gray-700 text-gray-300' : 'border-gray-200 text-gray-600'}`}>
            No archived items to restore.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedDates.map((dateKey, index) => {
              const isOpen = openDates[dateKey] ?? index === 0;
              const dayItems = groupedItems[dateKey];
              const formattedDate = new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              });

              return (
                <div key={dateKey} className={`rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white'}`}>
                  <button
                    type="button"
                    onClick={() => setOpenDates((prev) => ({ ...prev, [dateKey]: !isOpen }))}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}`}
                  >
                    <div>
                      <div className="font-bold">{formattedDate}</div>
                      <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        {dayItems.length} item{dayItems.length === 1 ? '' : 's'} deleted
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                      {isOpen ? 'Hide' : 'Show'}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 space-y-3">
                      {dayItems.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-4 ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                              <div className="font-bold">{itemTitle(item)}</div>
                              <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                Type: {item.entity_type} {item.location_name ? `• Location: ${item.location_name}` : ''} • Deleted: {new Date(item.deleted_at).toLocaleString('en-GB')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => restoreItem(item.id)}
                                disabled={restoringId === item.id || deletingId === item.id}
                                className="px-3 py-2 rounded font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white"
                              >
                                {restoringId === item.id ? 'Restoring...' : 'Restore'}
                              </button>
                              <button
                                onClick={() => deleteArchiveItem(item.id)}
                                disabled={restoringId === item.id || deletingId === item.id}
                                className="px-3 py-2 rounded font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white"
                              >
                                {deletingId === item.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
