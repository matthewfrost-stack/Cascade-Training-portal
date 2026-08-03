'use client';

import React from 'react';
import Icon from '@/app/components/Icon';

type Accent = 'blue' | 'purple' | 'emerald' | 'amber' | 'indigo' | 'cyan' | 'slate';
type Size = 'sm' | 'md';

const accentStyles: Record<Accent, string> = {
  blue: 'hover:border-blue-500 focus-visible:ring-blue-500/40 dark:hover:border-blue-400',
  purple: 'hover:border-purple-500 focus-visible:ring-purple-500/40 dark:hover:border-purple-400',
  emerald: 'hover:border-emerald-500 focus-visible:ring-emerald-500/40 dark:hover:border-emerald-400',
  amber: 'hover:border-amber-500 focus-visible:ring-amber-500/40 dark:hover:border-amber-400',
  indigo: 'hover:border-indigo-500 focus-visible:ring-indigo-500/40 dark:hover:border-indigo-400',
  cyan: 'hover:border-cyan-500 focus-visible:ring-cyan-500/40 dark:hover:border-cyan-400',
  slate: 'hover:border-slate-500 focus-visible:ring-slate-500/40 dark:hover:border-slate-300',
};

const sizeStyles: Record<Size, string> = {
  sm: 'rounded-2xl p-4',
  md: 'rounded-3xl p-8 md:p-10',
};

type Props = {
  title: string;
  description?: string;
  emoji?: string;
  onClick?: () => void;
  accent?: Accent;
  size?: Size;
  showChevron?: boolean;
  className?: string;
  disabled?: boolean;
};

export default function TileButton({
  title,
  description,
  emoji,
  onClick,
  accent = 'blue',
  size = 'md',
  showChevron = false,
  className = '',
  disabled = false,
}: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group text-left border shadow-lg transition-all focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 disabled:cursor-not-allowed flex h-full w-full flex-col justify-between ${
        sizeStyles[size]
      } bg-white border-slate-200 hover:bg-slate-50 dark:bg-slate-950/40 dark:border-slate-800 dark:hover:bg-slate-950/60 ${
        accentStyles[accent]
      } ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {emoji ? <div className={`${size === 'sm' ? 'text-3xl mb-2' : 'text-5xl mb-4'} leading-none`}>{emoji}</div> : null}
          <h2 className={`${size === 'sm' ? 'text-sm font-extrabold' : 'text-2xl md:text-3xl font-extrabold'} text-slate-900 dark:text-white`}>
            {title}
          </h2>
          {description ? (
            <p className={`mt-2 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-slate-600 dark:text-slate-300`}>
              {description}
            </p>
          ) : null}
        </div>

        {showChevron ? (
          <span
            className={`shrink-0 inline-flex items-center justify-center ${size === 'sm' ? 'rounded-xl p-2' : 'rounded-2xl p-3'} border transition-colors border-slate-200 bg-slate-50 group-hover:bg-white dark:border-slate-700 dark:bg-slate-900/40 dark:group-hover:bg-slate-900/60`}
          >
            <Icon name="chevron-right" className={size === 'sm' ? 'w-5 h-5' : 'w-6 h-6'} />
          </span>
        ) : null}
      </div>
    </button>
  );
}
