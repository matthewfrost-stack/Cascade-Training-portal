'use client';

import React from 'react';
import Icon from '@/app/components/Icon';

type Accent = 'blue' | 'purple' | 'emerald' | 'amber' | 'indigo' | 'cyan' | 'slate';
type Size = 'sm' | 'md';

const accentStyles: Record<Accent, { border: string; text: string }> = {
  blue: {
    border: 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:border-blue-400 dark:hover:bg-blue-950/30 focus-visible:ring-blue-500/40',
    text: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    border: 'hover:border-purple-500 hover:bg-purple-50/50 dark:hover:border-purple-400 dark:hover:bg-purple-950/30 focus-visible:ring-purple-500/40',
    text: 'text-purple-600 dark:text-purple-400',
  },
  emerald: {
    border: 'hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:border-emerald-400 dark:hover:bg-emerald-950/30 focus-visible:ring-emerald-500/40',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    border: 'hover:border-amber-500 hover:bg-amber-50/50 dark:hover:border-amber-400 dark:hover:bg-amber-950/30 focus-visible:ring-amber-500/40',
    text: 'text-amber-600 dark:text-amber-400',
  },
  indigo: {
    border: 'hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:border-indigo-400 dark:hover:bg-indigo-950/30 focus-visible:ring-indigo-500/40',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    border: 'hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:border-cyan-400 dark:hover:bg-cyan-950/30 focus-visible:ring-cyan-500/40',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  slate: {
    border: 'hover:border-slate-500 hover:bg-slate-50/50 dark:hover:border-slate-300 dark:hover:bg-slate-900/40 focus-visible:ring-slate-500/40',
    text: 'text-slate-600 dark:text-slate-300',
  },
};

const sizeStyles: Record<Size, string> = {
  sm: 'rounded-xl p-4 sm:p-5',
  md: 'rounded-2xl p-6 sm:p-8 min-h-[200px] sm:min-h-[220px]',
};

type Props = {
  title: string;
  description?: string;
  emoji?: string;
  onClick?: () => void;
  accent?: Accent;
  size?: Size;
  showChevron?: boolean;
  actionText?: string;
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
  actionText,
  className = '',
  disabled = false,
}: Props) {
  const accentConfig = accentStyles[accent] || accentStyles.blue;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`group text-left border-2 shadow-sm hover:shadow-md transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60 disabled:cursor-not-allowed flex h-full w-full flex-col justify-between ${
        sizeStyles[size]
      } bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700 ${
        accentConfig.border
      } ${className}`.trim()}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
          {emoji ? (
            <div className={`${size === 'sm' ? 'text-3xl' : 'text-4xl sm:text-5xl'} leading-none`}>
              {emoji}
            </div>
          ) : null}
          {showChevron && !actionText ? (
            <span
              className={`shrink-0 inline-flex items-center justify-center ${
                size === 'sm' ? 'rounded-lg p-1.5' : 'rounded-xl p-2.5'
              } border transition-colors border-gray-200 bg-gray-50 group-hover:bg-white dark:border-gray-700 dark:bg-gray-900/60 dark:group-hover:bg-gray-900`}
            >
              <Icon name="chevron-right" className={size === 'sm' ? 'w-4 h-4' : 'w-5 h-5'} />
            </span>
          ) : null}
        </div>

        <h2 className={`${size === 'sm' ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold'} text-gray-900 dark:text-white transition-colors duration-300`}>
          {title}
        </h2>
        {description ? (
          <p className={`mt-2 ${size === 'sm' ? 'text-xs' : 'text-sm'} text-gray-600 dark:text-gray-400 transition-colors duration-300`}>
            {description}
          </p>
        ) : null}
      </div>

      {actionText || showChevron ? (
        <div className={`mt-6 flex items-center ${accentConfig.text} font-semibold text-sm sm:text-base group-hover:translate-x-1 transition-transform`}>
          <span>{actionText || 'Open'}</span>
          <svg className="w-5 h-5 ml-2 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      ) : null}
    </button>
  );
}
