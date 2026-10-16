'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import UniformButton from './UniformButton';
import Icon from './Icon';
import { debugLog } from '@/lib/debug';

type TemplateItem = {
  id: string;
  item_name: string;
  item_order: number;
  is_active: boolean;
  is_invoice_number: boolean;
};
type ChecklistItem = { id: string; booking_id?: string; item_name: string; item_order: number };
type ChecklistCompletion = {
  checklist_item_id: string;
  value?: string | null;
  completed_by?: string;
  completed_by_name?: string;
  completed_at?: string;
};

export default function BookingChecklistModal({ 
  bookingId, 
  onClose,
  userRole,
  userName,
  userId
}: { 
  bookingId: string;
  onClose: () => void;
  userRole: string;
  userName: string;
  userId: string;
}) {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [completions, setCompletions] = useState<Record<string, ChecklistCompletion>>({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceItemNames, setInvoiceItemNames] = useState<Set<string>>(new Set(['Invoice Number']));
  const [loading, setLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canAccessChecklist = userRole === 'scheduler' || userRole === 'admin';

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ isDark?: boolean }>;
      if (typeof customEvent.detail?.isDark === 'boolean') setIsDark(customEvent.detail.isDark);
    };
    
    window.addEventListener('themeChange', handleThemeChange);
    return () => window.removeEventListener('themeChange', handleThemeChange);
  }, []);

  function checkTheme() {
    if (typeof window !== 'undefined') {
      const theme = localStorage.getItem('theme');
      const isDarkMode = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      setIsDark(isDarkMode);
    }
  }

  const fetchChecklist = useCallback(async () => {
    try {
      setError(null);
      debugLog('Fetching checklist for booking:', bookingId);

      const { data: templateItemsRaw, error: templateError } = await supabase
        .from('booking_checklist_template_items')
        .select('id, item_name, item_order, is_active, is_invoice_number')
        .eq('is_active', true)
        .order('item_order');

      if (templateError) {
        console.error('Error fetching checklist template:', templateError);
        setError(`Failed to fetch checklist template: ${templateError.message}`);
        return;
      }

      const templateItems = ((templateItemsRaw as TemplateItem[]) || []).filter((t) => t.item_name);
      const templateNames = templateItems.map((t) => t.item_name);
      const templateOrderByName = new Map<string, number>(
        templateItems.map((t) => [t.item_name, typeof t.item_order === 'number' ? t.item_order : 0])
      );
      const invoiceNameSet = new Set<string>(templateItems.filter((t) => t.is_invoice_number).map((t) => t.item_name));
      setInvoiceItemNames(invoiceNameSet.size > 0 ? invoiceNameSet : new Set(['Invoice Number']));
      
      // Fetch or create checklist items
      const { data: allExistingItems, error: fetchError } = await supabase
        .from('booking_checklists')
        .select('*')
        .eq('booking_id', bookingId)
        .order('item_order');

      if (fetchError) {
        console.error('Error fetching existing items:', fetchError);
        setError(`Failed to fetch checklist items: ${fetchError.message}`);
        return;
      }
      debugLog('Existing items:', allExistingItems);

      const existingItems = (Array.isArray(allExistingItems) ? allExistingItems : []) as ChecklistItem[];

      if (templateItems.length === 0) {
        setError('Checklist template is empty. Add items in Admin → Checklist Template.');
        return;
      }

      let finalChecklistItems: ChecklistItem[] = [];
      if (existingItems.length === 0) {
        debugLog('Creating new checklist items from template...');
        const itemsToInsert = templateItems.map((t) => ({
          booking_id: bookingId,
          item_name: t.item_name,
          item_order: t.item_order,
        }));

        const { data: newItems, error: insertError } = await supabase.from('booking_checklists').insert(itemsToInsert).select();
        if (insertError) {
          console.error('Error inserting items:', insertError);
          setError(`Failed to create checklist items: ${insertError.message}`);
          return;
        }
        debugLog('New items created:', newItems);
        finalChecklistItems = ((newItems || []) as ChecklistItem[]).sort((a, b) => (a.item_order || 0) - (b.item_order || 0));
        setChecklist(finalChecklistItems);
      } else {
        const existingNameSet = new Set(existingItems.map((i) => i.item_name).filter(Boolean));
        const missingTemplateItems = templateItems.filter((t) => !existingNameSet.has(t.item_name));

        if (missingTemplateItems.length > 0) {
          debugLog('Adding missing checklist items from template:', missingTemplateItems.map((t) => t.item_name));
          const itemsToInsert = missingTemplateItems.map((t) => ({
            booking_id: bookingId,
            item_name: t.item_name,
            item_order: t.item_order,
          }));
          const { error: addMissingError } = await supabase.from('booking_checklists').insert(itemsToInsert);
          if (addMissingError) {
            console.error('Error inserting missing items:', addMissingError);
            setError(`Failed to sync checklist items: ${addMissingError.message}`);
            return;
          }
        }

        const visibleExisting = existingItems.filter((i) => templateNames.includes(i.item_name));

        // Ensure the per-booking orders stay aligned with the template order
        const updates: Array<{ id: string; item_order: number }> = [];
        for (const row of visibleExisting) {
          const desired = templateOrderByName.get(row.item_name);
          if (typeof desired === 'number' && row.item_order !== desired) {
            updates.push({ id: row.id, item_order: desired });
          }
        }
        for (const u of updates) {
          await supabase.from('booking_checklists').update({ item_order: u.item_order }).eq('id', u.id);
        }

        // Re-fetch to ensure we display the synced set, in template order
        const { data: refreshedItems, error: refreshError } = await supabase
          .from('booking_checklists')
          .select('*')
          .eq('booking_id', bookingId)
          .in('item_name', templateNames)
          .order('item_order');
        if (refreshError) {
          console.error('Error refreshing synced items:', refreshError);
          setError(`Failed to refresh checklist items: ${refreshError.message}`);
          return;
        }
        finalChecklistItems = (refreshedItems || []) as ChecklistItem[];
        setChecklist(finalChecklistItems);
      }

      // Fetch completions
      const { data: completionData, error: completionError } = await supabase
        .from('checklist_completions')
        .select('*')
        .eq('booking_id', bookingId);

      if (completionError) {
        console.error('Error fetching completions:', completionError);
        setError(`Failed to fetch completions: ${completionError.message}`);
        return;
      }
      debugLog('Completions data:', completionData);

      const completionMap: Record<string, ChecklistCompletion> = {};
      completionData?.forEach(comp => {
        completionMap[comp.checklist_item_id] = comp;
      });
      setCompletions(completionMap);

      // Set invoice number if it exists
      const invoiceItem = completionData?.find(comp => {
        const item = finalChecklistItems.find((i) => i.id === comp.checklist_item_id);
        return item?.item_name && invoiceNameSet.has(item.item_name);
      });
      if (invoiceItem?.value) {
        setInvoiceNumber(invoiceItem.value);
      }
    } catch (error: unknown) {
      console.error('Error in fetchChecklist:', error);
      setError(error instanceof Error ? error.message : 'An unexpected error occurred');
    }
  }, [bookingId]);

  useEffect(() => {
    checkTheme();
    if (canAccessChecklist) {
      void fetchChecklist();
    }
  }, [canAccessChecklist, fetchChecklist]);

  const handleToggleItem = async (itemId: string, itemName: string, isCompleting: boolean) => {
    if (userRole !== 'scheduler' && userRole !== 'admin') {
      alert('Only Schedulers and Admins can update the checklist');
      return;
    }

    setLoading(true);
    try {
      if (isCompleting) {
        // Mark as complete
        const { error } = await supabase
          .from('checklist_completions')
          .insert([{
            booking_id: bookingId,
            checklist_item_id: itemId,
            completed_by: userId,
            completed_by_name: userName,
            completed_at: new Date().toISOString(),
            value: invoiceItemNames.has(itemName) ? invoiceNumber : null
          }]);

        if (error) throw error;
      } else {
        // Mark as incomplete (delete the completion record)
        const { error } = await supabase
          .from('checklist_completions')
          .delete()
          .eq('booking_id', bookingId)
          .eq('checklist_item_id', itemId);

        if (error) throw error;
      }

      await fetchChecklist();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Failed to update checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleInvoiceNumberChange = async (e: React.FocusEvent<HTMLInputElement>) => {
    const newValue = e.target.value.trim();
    setInvoiceNumber(newValue);

    if (!newValue) return;

    try {
      // Find the invoice number item
      const invoiceItem = checklist.find(item => invoiceItemNames.has(item.item_name));
      if (!invoiceItem) return;

      const isCompleted = !!completions[invoiceItem.id];

      if (isCompleted) {
        // Update existing completion with new invoice number
        const { error } = await supabase
          .from('checklist_completions')
          .update({ value: newValue })
          .eq('booking_id', bookingId)
          .eq('checklist_item_id', invoiceItem.id);

        if (error) throw error;
      } else {
        // Create completion with invoice number
        const { error } = await supabase
          .from('checklist_completions')
          .insert([{
            booking_id: bookingId,
            checklist_item_id: invoiceItem.id,
            completed_by: userId,
            completed_by_name: userName,
            completed_at: new Date().toISOString(),
            value: newValue
          }]);

        if (error) throw error;
      }

      await fetchChecklist();
    } catch (error: unknown) {
      alert(error instanceof Error ? error.message : 'Failed to save invoice number');
    }
  };

  const completedCount = Object.keys(completions).length;
  const totalCount = checklist.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (!canAccessChecklist) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-4 sm:p-8 w-full max-w-xl shadow-2xl border transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">Access Restricted</h2>
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
          <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="p-4 border rounded">
            <p style={{ color: isDark ? '#cbd5f5' : '#334155' }} className="font-semibold">
              Only Schedulers and Admins can access the booking checklist.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-4 sm:p-8 w-full max-w-2xl shadow-2xl border transition-colors duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 style={{ color: '#ef4444' }} className="text-2xl font-black uppercase tracking-tight">Error Loading Checklist</h2>
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
          <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: '#ef4444' }} className="p-4 border-l-4 rounded">
            <p style={{ color: isDark ? '#fca5a5' : '#dc2626' }} className="font-semibold">{error}</p>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm mt-2">Please check your browser console for more details and contact support if the problem persists.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', borderColor: isDark ? '#334155' : '#cbd5e1' }} className="rounded-3xl p-4 sm:p-8 w-full max-w-2xl shadow-2xl border transition-colors duration-300 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 style={{ color: isDark ? '#f1f5f9' : '#1e293b' }} className="text-2xl font-black uppercase tracking-tight">Booking Checklist</h2>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm mt-1">
              {checklist.length === 0 ? 'Loading...' : `${completedCount} of ${totalCount} completed`}
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

        {checklist.length === 0 ? (
          <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9' }} className="p-8 rounded-xl text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-sm">Loading checklist...</p>
          </div>
        ) : (
          <>
            {/* Progress Bar */}
            <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }} className="rounded-full h-3 border mb-6 overflow-hidden">
              <div 
                style={{ backgroundColor: '#10b981', width: `${progressPercent}%` }}
                className="h-full transition-all duration-300"
              />
            </div>

            {/* Checklist Items */}
            <div className="space-y-3">
              {checklist.map((item) => {
                const isCompleted = !!completions[item.id];
                const completion = completions[item.id];
            const isInvoiceNumber = invoiceItemNames.has(item.item_name);

            return (
              <div
                key={item.id}
                style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0' }}
                className="p-4 border rounded-xl flex items-start gap-3 transition-all"
              >
                {isInvoiceNumber ? (
                  <input
                    type="text"
                    placeholder="Enter invoice number"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    onBlur={handleInvoiceNumberChange}
                    disabled={loading || (userRole !== 'scheduler' && userRole !== 'admin')}
                    style={{ backgroundColor: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#1e293b', borderColor: isDark ? '#334155' : '#e2e8f0' }}
                    className="flex-1 p-2 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  />
                ) : (
                  <>
                    <input
                      type="checkbox"
                      checked={isCompleted}
                      onChange={(e) => handleToggleItem(item.id, item.item_name, e.target.checked)}
                      disabled={loading || (userRole !== 'scheduler' && userRole !== 'admin')}
                      className="w-5 h-5 rounded mt-0.5 cursor-pointer disabled:opacity-50"
                    />

                    <div className="flex-1">
                      <p 
                        style={{ 
                          color: isDark ? '#f1f5f9' : '#1e293b',
                          textDecoration: isCompleted ? 'line-through' : 'none'
                        }} 
                        className="font-bold"
                      >
                        {item.item_name}
                      </p>

                      {completion && (
                        <div style={{ color: isDark ? '#94a3b8' : '#64748b' }} className="text-[9px] mt-2 space-y-1">
                          <p><span className="font-bold">Completed by:</span> {completion.completed_by_name}</p>
                          <p><span className="font-bold">Time:</span> {completion.completed_at ? new Date(completion.completed_at).toLocaleString() : 'Unknown'}</p>
                        </div>
                      )}
                    </div>

                    {isCompleted && (
                      <div className="text-green-500 text-xl mt-0.5">✓</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
            </div>

            {userRole !== 'scheduler' && userRole !== 'admin' && (
              <div style={{ backgroundColor: isDark ? '#0f172a' : '#f1f5f9', borderColor: isDark ? '#334155' : '#e2e8f0', color: isDark ? '#94a3b8' : '#64748b' }} className="mt-6 p-4 border rounded-xl text-center text-sm">
                Only Schedulers and Admins can update this checklist
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
