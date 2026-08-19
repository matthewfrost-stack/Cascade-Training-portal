'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import UniformButton from './UniformButton';
import Icon from './Icon';

type TemplateItem = {
  id: string;
  item_name: string;
  item_order: number;
  is_active: boolean;
  is_invoice_number: boolean;
};

export default function ChecklistTemplateModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const [newIsInvoiceNumber, setNewIsInvoiceNumber] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    checkTheme();
    fetchItems();
  }, []);

  useEffect(() => {
    const handleThemeChange = (event: any) => setIsDark(event.detail.isDark);
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  function checkTheme() {
    if (typeof window === 'undefined') return;
    const theme = localStorage.getItem('theme');
    const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDark(isDarkMode);
  }

  const activeCount = useMemo(() => items.filter((i) => i.is_active).length, [items]);

  async function fetchItems() {
    const { data, error } = await supabase
      .from('booking_checklist_template_items')
      .select('id, item_name, item_order, is_active, is_invoice_number')
      .order('item_order');
    if (error) {
      alert(error.message);
      return;
    }
    setItems((data as TemplateItem[]) || []);
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const name = newItemName.trim();
    if (!name) return;

    setLoading(true);
    try {
      const nextOrder = (items.reduce((max, it) => Math.max(max, it.item_order || 0), 0) || 0) + 1;
      const { error } = await supabase.from('booking_checklist_template_items').insert([
        {
          item_name: name,
          item_order: nextOrder,
          is_active: true,
          is_invoice_number: !!newIsInvoiceNumber,
        },
      ]);
      if (error) throw error;
      setNewItemName('');
      setNewIsInvoiceNumber(false);
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to add checklist item');
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(item: TemplateItem) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('booking_checklist_template_items')
        .update({ is_active: !item.is_active })
        .eq('id', item.id);
      if (error) throw error;
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to update checklist item');
    } finally {
      setLoading(false);
    }
  }

  async function toggleInvoiceFlag(item: TemplateItem) {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('booking_checklist_template_items')
        .update({ is_invoice_number: !item.is_invoice_number })
        .eq('id', item.id);
      if (error) throw error;
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to update checklist item');
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(item: TemplateItem) {
    if (!confirm(`Remove "${item.item_name}" from the checklist template? This will hide it from future checklists.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/checklist-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'Failed to remove checklist item');
      if (editingId === item.id) cancelEdit();
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to remove checklist item');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(item: TemplateItem) {
    setEditingId(item.id);
    setEditingName(item.item_name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  async function saveEdit(item: TemplateItem) {
    const name = editingName.trim();
    if (!name) {
      alert('Item name is required');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('booking_checklist_template_items').update({ item_name: name }).eq('id', item.id);
      if (error) throw error;
      cancelEdit();
      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  }

  async function move(item: TemplateItem, direction: 'up' | 'down') {
    const ordered = [...items].sort((a, b) => (a.item_order || 0) - (b.item_order || 0));
    const idx = ordered.findIndex((i) => i.id === item.id);
    const swapWith = direction === 'up' ? ordered[idx - 1] : ordered[idx + 1];
    if (!swapWith) return;

    setLoading(true);
    try {
      const { error: e1 } = await supabase
        .from('booking_checklist_template_items')
        .update({ item_order: swapWith.item_order })
        .eq('id', item.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from('booking_checklist_template_items')
        .update({ item_order: item.item_order })
        .eq('id', swapWith.id);
      if (e2) throw e2;

      await fetchItems();
    } catch (err: any) {
      alert(err.message || 'Failed to reorder items');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div
        style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }}
        className="rounded-3xl p-4 sm:p-8 w-full max-w-3xl shadow-2xl border transition-colors duration-300 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">
              Booking Checklist Template
            </h2>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm mt-1">
              {activeCount} active item{activeCount === 1 ? '' : 's'}
            </p>
          </div>
          <UniformButton
            variant="icon"
            className="hover:text-red-500 text-2xl transition-colors"
            style={{ color: isDark ? '#94a3b8' : '#64748b' }}
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="close" className="w-6 h-6" />
          </UniformButton>
        </div>

        <form
          onSubmit={addItem}
          style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }}
          className="p-4 sm:p-5 rounded-2xl border mb-6"
        >
          <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[10px] font-black uppercase mb-3">
            Add Item
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="e.g. Provider confirmed venue access?"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              className="md:col-span-2 w-full p-3 border rounded-xl outline-none font-bold text-sm"
            />
            <UniformButton
              variant="primary"
              type="submit"
              disabled={loading || !newItemName.trim()}
              className="py-3 rounded-xl font-bold shadow-lg transition-all disabled:opacity-50 hover:scale-105 active:scale-95 duration-200"
              style={{ backgroundColor: '#2563eb', color: '#fff' }}
            >
              Add
            </UniformButton>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs font-bold" style={{ color: isDark ? '#cbd5e1' : '#475569' }}>
            <input
              type="checkbox"
              checked={newIsInvoiceNumber}
              onChange={(e) => setNewIsInvoiceNumber(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Treat as “Invoice Number” input
          </label>
        </form>

        <div className="space-y-3">
          {items.map((item, index) => {
            const isEditing = editingId === item.id;
            const isFirst = index === 0;
            const isLast = index === items.length - 1;

            return (
              <div
                key={item.id}
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }}
                className="p-4 border rounded-2xl flex flex-col sm:flex-row items-start gap-3"
              >
                <div className="flex flex-row sm:flex-col gap-2 pt-1">
                  <button
                    type="button"
                    disabled={loading || isFirst}
                    onClick={() => move(item, 'up')}
                    className="text-xs font-black disabled:opacity-40"
                    style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={loading || isLast}
                    onClick={() => move(item, 'down')}
                    className="text-xs font-black disabled:opacity-40"
                    style={{ color: isDark ? '#94a3b8' : '#64748b' }}
                    title="Move down"
                  >
                    ↓
                  </button>
                </div>

                <div className="flex-1">
                  {isEditing ? (
                    <input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#cbd5e1' }}
                      className="w-full p-2 border rounded-lg outline-none font-bold text-sm"
                    />
                  ) : (
                    <p style={{ color: isDark ? '#f1f5f9' : '#1e293b', opacity: item.is_active ? 1 : 0.6 }} className="font-bold">
                      {item.item_name}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => toggleActive(item)}
                      className="px-3 py-1 rounded-lg text-[10px] font-black uppercase"
                      style={{
                        backgroundColor: item.is_active ? '#16a34a' : (isDark ? '#334155' : '#cbd5e1'),
                        color: item.is_active ? '#fff' : (isDark ? '#f1f5f9' : '#1e293b'),
                      }}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </button>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => toggleInvoiceFlag(item)}
                      className="px-3 py-1 rounded-lg text-[10px] font-black uppercase"
                      style={{
                        backgroundColor: item.is_invoice_number ? '#a855f7' : (isDark ? '#334155' : '#cbd5e1'),
                        color: item.is_invoice_number ? '#fff' : (isDark ? '#f1f5f9' : '#1e293b'),
                      }}
                      title="Controls whether this row shows as a text input in the checklist UI"
                    >
                      {item.is_invoice_number ? 'Invoice Input' : 'Checkbox'}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  {isEditing ? (
                    <>
                      <UniformButton
                        variant="primary"
                        type="button"
                        disabled={loading}
                        onClick={() => saveEdit(item)}
                        className="px-4 py-2 rounded-xl font-bold shadow-md"
                        style={{ backgroundColor: '#2563eb', color: '#fff' }}
                      >
                        Save
                      </UniformButton>
                      <UniformButton
                        variant="secondary"
                        type="button"
                        disabled={loading}
                        onClick={cancelEdit}
                        className="px-4 py-2 rounded-xl font-bold shadow-md"
                        style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1', color: isDark ? '#f1f5f9' : '#1e293b' }}
                      >
                        Cancel
                      </UniformButton>
                    </>
                  ) : (
                    <>
                      <UniformButton
                        variant="secondary"
                        type="button"
                        disabled={loading}
                        onClick={() => startEdit(item)}
                        className="px-4 py-2 rounded-xl font-bold shadow-md"
                        style={{ backgroundColor: isDark ? '#334155' : '#cbd5e1', color: isDark ? '#f1f5f9' : '#1e293b' }}
                      >
                        Edit
                      </UniformButton>
                      <UniformButton
                        variant="danger"
                        type="button"
                        disabled={loading}
                        onClick={() => removeItem(item)}
                        className="px-4 py-2 rounded-xl font-bold shadow-md"
                        title="Remove item from checklist template"
                      >
                        Remove
                      </UniformButton>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
