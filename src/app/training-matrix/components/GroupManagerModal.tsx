'use client';
import React, { useMemo, useState } from 'react';
import { useMatrix } from '../context/MatrixContext';

type GroupType = 'staff' | 'course';

interface GroupManagerModalProps {
  initialType?: GroupType;
  // For staff: the divider id (e.g. "divider-uuid"). For course: the category name.
  editKey?: string | null;
  onClose: () => void;
}

export function GroupManagerModal({ initialType = 'staff', editKey = null, onClose }: GroupManagerModalProps) {
  const {
    isDark, staff, staffDividers, courses,
    createStaffGroup, updateStaffGroup, deleteStaffGroup, setCourseGroup, deleteCourseGroup,
  } = useMatrix();

  const [type, setType] = useState<GroupType>(initialType);
  // The group currently being edited: staff divider id or course category name. '' = new group.
  const [selectedKey, setSelectedKey] = useState<string>(editKey || '');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  // Existing groups of the active type -> { key, name }
  const staffGroups = useMemo(
    () => staff.filter((s: any) => staffDividers.has(s.id)).map((d: any) => ({ key: d.id, name: d.name })),
    [staff, staffDividers]
  );
  const courseGroups = useMemo(() => {
    const names = new Set<string>();
    courses.forEach((c: any) => { if (c.category) names.add(c.category); });
    return Array.from(names).sort().map(n => ({ key: n, name: n }));
  }, [courses]);
  const existingGroups = type === 'staff' ? staffGroups : courseGroups;

  // Members currently in the selected group.
  const currentMembers = useMemo(() => {
    if (!selectedKey) return new Set<string>();
    if (type === 'course') {
      return new Set<string>(courses.filter((c: any) => c.category === selectedKey).map((c: any) => c.id));
    }
    // staff: positional — members are the rows between this divider and the next
    const ids = new Set<string>();
    let inGroup = false;
    for (const item of staff as any[]) {
      if (staffDividers.has(item.id)) { inGroup = item.id === selectedKey; continue; }
      if (inGroup) ids.add(item.id);
    }
    return ids;
  }, [type, selectedKey, staff, staffDividers, courses]);

  const originalName = useMemo(() => {
    if (!selectedKey) return '';
    if (type === 'staff') return staffGroups.find((g: { key: string; name: string }) => g.key === selectedKey)?.name || '';
    return selectedKey;
  }, [type, selectedKey, staffGroups]);

  const [name, setName] = useState<string>(originalName);
  const [checked, setChecked] = useState<Set<string>>(currentMembers);

  // Re-seed name/checked whenever the selected group or type changes.
  const seedRef = React.useRef<string>('');
  const seedKey = `${type}:${selectedKey}`;
  if (seedRef.current !== seedKey) {
    seedRef.current = seedKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setName(originalName);
    setChecked(new Set(currentMembers));
  }

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = type === 'staff'
      ? (staff as any[]).filter(s => !staffDividers.has(s.id)).map(s => ({ id: s.id, label: s.name }))
      : (courses as any[]).map(c => ({ id: c.id, label: c.name }));
    if (!q) return list;
    return list.filter(i => i.label?.toLowerCase().includes(q));
  }, [type, staff, staffDividers, courses, search]);

  const toggle = (id: string) => {
    setChecked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAllShown = () => setChecked(prev => { const n = new Set(prev); items.forEach(i => n.add(i.id)); return n; });
  const clearShown = () => setChecked(prev => { const n = new Set(prev); items.forEach(i => n.delete(i.id)); return n; });

  const handleSave = async () => {
    if (!name.trim()) { alert('Please enter a group name.'); return; }
    setSaving(true);
    try {
      const memberIds = Array.from(checked);
      if (type === 'staff') {
        if (selectedKey) await updateStaffGroup(selectedKey, name, memberIds);
        else await createStaffGroup(name, memberIds);
      } else {
        await setCourseGroup(name, selectedKey || null, memberIds);
      }
      onClose();
    } catch (e) {
      console.error('Failed to save group:', e);
      alert(`Failed to save group: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedKey) return;
    if (!confirm(`Delete the group "${originalName}"? Members will be ungrouped (not deleted).`)) return;
    setSaving(true);
    try {
      if (type === 'staff') await deleteStaffGroup(selectedKey);
      else await deleteCourseGroup(selectedKey);
      onClose();
    } catch (e) {
      console.error('Failed to delete group:', e);
    } finally {
      setSaving(false);
    }
  };

  const panel = isDark ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900';
  const field = isDark ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300 text-gray-800';
  const subtle = isDark ? 'text-gray-400' : 'text-slate-500';
  const rowHover = isDark ? 'hover:bg-gray-800/60' : 'hover:bg-slate-50';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-black/60' : 'bg-black/40'}`} onClick={onClose}>
      <div className={`rounded-2xl border shadow-2xl w-[440px] max-w-[92vw] p-6 ${panel}`} onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-black tracking-tight mb-4">{selectedKey ? 'Edit Group' : 'Create Group'}</h3>

        {/* Type toggle */}
        <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${subtle}`}>Group Type</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(['staff', 'course'] as GroupType[]).map(t => (
            <button
              key={t}
              onClick={() => { if (t !== type) { setType(t); setSelectedKey(''); } }}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${type === t ? 'bg-blue-600 text-white shadow-sm' : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {t === 'staff' ? '👥 Staff Group' : '📚 Course Group'}
            </button>
          ))}
        </div>

        {/* Existing group selector */}
        <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${subtle}`}>Group</label>
        <select
          value={selectedKey}
          onChange={(e) => setSelectedKey(e.target.value)}
          className={`w-full px-3 py-2 rounded-xl border text-sm font-bold mb-3 ${field}`}
        >
          <option value="">➕ New group…</option>
          {existingGroups.map((g: { key: string; name: string }) => <option key={g.key} value={g.key}>{g.name}</option>)}
        </select>

        {/* Name */}
        <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${subtle}`}>Group Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={type === 'staff' ? 'e.g. Team Leaders' : 'e.g. Mandatory Training'}
          className={`w-full px-3 py-2 rounded-xl border text-sm mb-4 ${field}`}
        />

        {/* Member multi-select */}
        <div className="flex items-center justify-between mb-2">
          <label className={`text-[10px] font-black uppercase tracking-widest ${subtle}`}>
            {type === 'staff' ? 'Staff at this site' : 'Courses at this site'} ({checked.size} selected)
          </label>
          <div className="flex gap-2 text-[10px] font-bold">
            <button onClick={selectAllShown} className="text-blue-500 hover:text-blue-400">Select shown</button>
            <button onClick={clearShown} className={subtle}>Clear shown</button>
          </div>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          className={`w-full px-3 py-1.5 rounded-lg border text-xs mb-2 ${field}`}
        />
        <div className={`rounded-xl border max-h-56 overflow-y-auto ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          {items.length === 0 ? (
            <p className={`text-xs p-3 ${subtle}`}>Nothing found.</p>
          ) : items.map(i => (
            <label key={i.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-b last:border-b-0 ${isDark ? 'border-gray-800/70' : 'border-gray-100'} ${rowHover}`}>
              <input type="checkbox" checked={checked.has(i.id)} onChange={() => toggle(i.id)} className="w-4 h-4 cursor-pointer" />
              <span className="truncate">{i.label}</span>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-5">
          {selectedKey ? (
            <button onClick={handleDelete} disabled={saving} className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50">Delete group</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving} className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
