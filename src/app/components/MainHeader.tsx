'use client';

import { useRouter } from 'next/navigation';
import BackButton from '@/app/components/BackButton';
import ThemeToggle from '@/app/components/ThemeToggle';
import UniformButton from './UniformButton';

type MainHeaderProps = {
  title: string;
  backPath?: string;
  showThemeToggle?: boolean;
};

export default function MainHeader({ title, backPath, showThemeToggle = true }: MainHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 bg-white dark:bg-[#1e293b] p-4 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
      <div className="flex items-center gap-4 w-full sm:w-auto">
        {backPath && (
          <BackButton to={backPath} />
        )}
        <h1 className="text-lg sm:text-xl font-black uppercase text-slate-800 dark:text-white tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto justify-end">
        {showThemeToggle && <ThemeToggle className="rounded-xl" />}
        {!backPath && (
          <UniformButton
            variant="primary"
            size="sm"
            className="whitespace-nowrap"
            onClick={() => router.push('/admin')}
          >
            Admin Dashboard
          </UniformButton>
        )}
      </div>
    </header>
  );
}
