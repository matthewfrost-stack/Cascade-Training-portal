'use client';

import React, { useState } from 'react';

export interface DisplayRecordItem {
  staffId?: string;
  staffName: string;
  courseId?: string;
  courseName: string;
  location?: string;
  date?: string;
  status?: string;
  type?: 'expiring' | 'expired' | 'allocated' | 'missing';
}

function recordPriority(record: DisplayRecordItem): number {
  switch (record.type || record.status) {
    case 'missing':
      return 0;
    case 'expired':
      return 1;
    case 'expiring':
      return 2;
    case 'allocated':
      return 3;
    default:
      return 4;
  }
}

function sortRecords(records: DisplayRecordItem[]): DisplayRecordItem[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => recordPriority(a.record) - recordPriority(b.record) || a.index - b.index)
    .map(({ record }) => record);
}

interface HoverPopoverCardProps {
  title: string;
  records: DisplayRecordItem[];
  children: React.ReactNode;
  onCardClick?: () => void;
  accentColor?: 'red' | 'blue' | 'yellow' | 'purple' | 'amber';
  isDark?: boolean;
  /**
   * These cards sit at the top of their pages, so the preview drops down by
   * default — opening upwards pushed it off the top of the viewport.
   */
  placement?: 'top' | 'bottom';
}

export function HoverPopoverCard({
  title,
  records,
  children,
  onCardClick,
  accentColor = 'blue',
  isDark = true,
  placement = 'bottom',
}: HoverPopoverCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const sortedRecords = sortRecords(records);

  const accentStyles = {
    red: 'border-red-500/40 text-red-500 bg-red-500/10',
    blue: 'border-blue-500/40 text-blue-500 bg-blue-500/10',
    yellow: 'border-amber-500/40 text-amber-500 bg-amber-500/10',
    purple: 'border-purple-500/40 text-purple-500 bg-purple-500/10',
    amber: 'border-amber-500/40 text-amber-500 bg-amber-500/10',
  }[accentColor];

  return (
    <div
      className="relative inline-block h-full w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        onClick={onCardClick}
        className={onCardClick ? 'cursor-pointer group' : ''}
      >
        {children}
      </div>

      {/* Popover preview on hover */}
      {isHovered && sortedRecords.length > 0 && (
        // The offset is padding rather than margin so the gap between card and
        // popover stays inside the hover target — a margin gap drops the hover
        // and closes the popover before the pointer can reach it to scroll.
        <div
          className={`absolute left-0 sm:left-1/2 sm:-translate-x-1/2 z-[9999] w-[calc(100vw-2rem)] max-w-80 animate-in fade-in zoom-in-95 duration-150 ${
            placement === 'top' ? 'bottom-full pb-2' : 'top-full pt-2'
          }`}
        >
          <div
            className={`p-3 rounded-2xl border shadow-2xl backdrop-blur-xl sm:p-3.5 ${
              isDark
                ? 'bg-slate-900/95 border-slate-700/80 text-white'
                : 'bg-white/95 border-slate-200 text-slate-900'
            }`}
          >
            <div className={`flex flex-wrap items-center justify-between gap-2 border-b pb-2 mb-2 ${isDark ? 'border-slate-700/30' : 'border-slate-200'}`}>
              <span className="min-w-0 break-words text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 sm:text-xs">
                <span className={`w-2 h-2 rounded-full ${accentStyles}`} />
                {title}
              </span>
              <span className={`shrink-0 whitespace-nowrap text-[10px] font-bold px-2 py-0.5 rounded-full sm:text-[11px] ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                {records.length} {records.length === 1 ? 'record' : 'records'}
              </span>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain pr-1">
                {sortedRecords.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg text-xs border flex items-start justify-between gap-2 ${
                    isDark
                      ? 'bg-slate-800/60 border-slate-700/50 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold break-words">{item.staffName}</p>
                    <p className={`text-[10px] break-words ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {item.courseName} {item.location ? `• ${item.location}` : ''}
                    </p>
                  </div>
                  {item.date && (
                    <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap ${isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-200 text-slate-700'}`}>
                      {formatDate(item.date)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {onCardClick && (
              <p className={`text-[10px] text-center font-medium mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Scroll for more · Click to expand
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface RecordDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  records: DisplayRecordItem[];
  isDark?: boolean;
  onSelectStaff?: (staffName: string) => void;
}

export function RecordDetailModal({
  isOpen,
  onClose,
  title,
  records,
  isDark = true,
  onSelectStaff,
}: RecordDetailModalProps) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = records.filter(
    (r) =>
      r.staffName.toLowerCase().includes(search.toLowerCase()) ||
      r.courseName.toLowerCase().includes(search.toLowerCase()) ||
      (r.location && r.location.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto p-2 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200 sm:p-4">
      <div
        className={`w-full max-w-3xl rounded-2xl border shadow-2xl flex min-h-0 flex-col max-h-[calc(100dvh-1rem)] overflow-hidden sm:rounded-3xl sm:max-h-[85vh] ${
          isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Modal Header */}
        <div className={`shrink-0 px-4 py-3 border-b flex items-start justify-between gap-3 sm:px-6 sm:py-4 sm:items-center sm:gap-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="min-w-0">
            <h3 className="break-words text-base leading-tight font-bold sm:text-xl">{title}</h3>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Showing {filtered.length} of {records.length} records
            </p>
          </div>
          <button
            onClick={onClose}
            className={`shrink-0 p-2 rounded-xl transition-colors ${isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'}`}
          >
            ✕
          </button>
        </div>

        {/* Search Bar */}
        <div className={`shrink-0 px-4 py-3 border-b sm:px-6 ${isDark ? 'border-slate-800/60 bg-slate-900/50' : 'border-slate-200 bg-slate-100'}`}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by staff name, course, or location..."
            className={`w-full px-4 py-2.5 text-base rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/20 sm:py-2 sm:text-sm ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                : 'bg-slate-100 border-slate-300 text-slate-800 placeholder-slate-400'
            }`}
          />
        </div>

        {/* Record List */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-6">
          {filtered.length === 0 ? (
            <p className={`text-center py-10 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              No matching records found.
            </p>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:p-3.5 ${
                  isDark
                    ? 'bg-slate-800/50 border-slate-700/60 hover:bg-slate-800'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                } transition-colors`}
              >
                <div className="min-w-0 w-full flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`break-words font-bold text-sm ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.staffName}</p>
                    {item.type && (
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.type === 'expired' || item.type === 'missing'
                            ? `bg-red-500/20 ${isDark ? 'text-red-400' : 'text-red-600'} border border-red-500/30`
                            : item.type === 'allocated'
                            ? `bg-amber-500/20 ${isDark ? 'text-amber-400' : 'text-amber-700'} border border-amber-500/30`
                            : `bg-blue-500/20 ${isDark ? 'text-blue-400' : 'text-blue-700'} border border-blue-500/30`
                        }`}
                      >
                        {item.type}
                      </span>
                    )}
                  </div>
                  <p className={`mt-0.5 break-words text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span className={`font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{item.courseName}</span>
                    {item.location ? ` • ${item.location}` : ''}
                  </p>
                </div>

                <div className="flex w-full flex-wrap items-center justify-end gap-2 self-end sm:w-auto sm:gap-3 sm:self-center">
                  {item.date && (
                    <span className={`text-xs font-mono font-medium px-2.5 py-1 rounded-lg border ${isDark ? 'bg-slate-700/40 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                      {formatDate(item.date)}
                    </span>
                  )}
                  {onSelectStaff && (
                    <button
                      onClick={() => {
                        onSelectStaff(item.staffName);
                        onClose();
                      }}
                      className="min-h-10 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Filter Matrix
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className={`shrink-0 px-4 py-3 border-t flex justify-end sm:px-6 sm:py-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`min-h-10 px-5 py-2 rounded-xl text-xs font-bold transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-800'}`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
