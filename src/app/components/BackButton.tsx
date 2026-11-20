'use client';

import { usePathname, useRouter } from 'next/navigation';
import UniformButton from '@/app/components/UniformButton';
import Icon from '@/app/components/Icon';

type Props = {
  to?: string;
  onClick?: () => void;
  label?: string;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  labelClassName?: string;
  title?: string;
};

function getParentRoute(pathname: string | null): string {
  if (!pathname || pathname === '/') return '/';



  if (pathname === '/dashboard') return '/';
  if (
    pathname === '/training-matrix' ||
    pathname === '/apps/booking-calendar' ||
    pathname.startsWith('/apps/booking-calendar/') ||
    pathname === '/apps/expiry-checker' ||
    pathname.startsWith('/apps/expiry-checker/') ||
    pathname === '/apps/training-course-checker' ||
    pathname.startsWith('/apps/training-course-checker/')
  ) {
    return '/dashboard';
  }



  if (pathname === '/admin') return '/';
  if (pathname === '/reports') return '/';
  if (
    pathname === '/analytics' ||
    pathname.startsWith('/analytics/') ||
    pathname === '/feedback/results' ||
    pathname.startsWith('/feedback/results/')
  ) {
    return '/reports';
  }
  if (
    pathname === '/admin-tools' ||
    pathname.startsWith('/admin-tools/') ||
    pathname === '/analytics' ||
    pathname.startsWith('/analytics/') ||
    pathname === '/feedback/results' ||
    pathname.startsWith('/feedback/results/') ||
    pathname === '/automation-control' ||
    pathname.startsWith('/automation-control/') ||
    pathname === '/admin/archive' ||
    pathname.startsWith('/admin/archive/')
  ) {
    return '/admin';
  }

  if (pathname === '/profile') return '/';
  if (pathname === '/feedback') return '/';
  if (pathname === '/auth/change-password-required') return '/';

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length <= 1) return '/';
  return `/${segments.slice(0, -1).join('/')}`;
}

export default function BackButton({
  to,
  onClick,
  label = 'Back',
  className = '',
  variant = 'secondary',
  size = 'md',
  showIcon = true,
  labelClassName = 'sr-only',
  title,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = () => {
    if (onClick) return onClick();
    if (to) return router.push(to);
    return router.push(getParentRoute(pathname));
  };

  return (
    <UniformButton
      variant={variant}
      size={size}
      onClick={handleClick}
      className={`no-ui-motion h-10 w-10 rounded-full border border-slate-300 bg-white p-0 text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white ${className}`.trim()}
      aria-label={label}
      title={title ?? label}
    >
      {showIcon ? <Icon name="back" className="h-5 w-5" /> : null}
      <span className={labelClassName}>{label}</span>
    </UniformButton>
  );
}
