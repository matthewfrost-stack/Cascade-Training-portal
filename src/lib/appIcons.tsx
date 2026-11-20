import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  GraduationCap,
  Grid3x3,
  House,
  ListChecks,
  Mail,
  MapPin,
  Settings,
  Star,
  TrendingUp,
  Upload,
  UserRoundX,
  Users,
} from 'lucide-react';

/**
 * One icon and colour per area of the portal, so the dashboard, side menu,
 * Reports and Admin pages always match. White line icon on a coloured badge.
 */
export type AppIconName =
  | 'home' | 'matrix' | 'reports' | 'calendar' | 'qualifications' | 'expiry' | 'admin'
  | 'compliance' | 'hub' | 'feedback'
  | 'staff' | 'archive' | 'duplicates' | 'venues' | 'courses' | 'checklist' | 'emails' | 'sync';

const ICONS: Record<AppIconName, { icon: LucideIcon; bg: string }> = {
  home: { icon: House, bg: 'bg-slate-600' },
  matrix: { icon: Grid3x3, bg: 'bg-purple-600' },
  reports: { icon: ChartColumn, bg: 'bg-emerald-600' },
  calendar: { icon: CalendarDays, bg: 'bg-blue-600' },
  qualifications: { icon: GraduationCap, bg: 'bg-amber-500' },
  expiry: { icon: CalendarClock, bg: 'bg-rose-600' },
  admin: { icon: Settings, bg: 'bg-slate-700' },
  // Reports page
  compliance: { icon: ClipboardCheck, bg: 'bg-emerald-600' },
  hub: { icon: TrendingUp, bg: 'bg-sky-600' },
  feedback: { icon: Star, bg: 'bg-amber-500' },
  // Admin page
  staff: { icon: Users, bg: 'bg-blue-600' },
  archive: { icon: Archive, bg: 'bg-sky-600' },
  duplicates: { icon: UserRoundX, bg: 'bg-rose-600' },
  venues: { icon: MapPin, bg: 'bg-amber-500' },
  courses: { icon: BookOpen, bg: 'bg-purple-600' },
  checklist: { icon: ListChecks, bg: 'bg-indigo-600' },
  emails: { icon: Mail, bg: 'bg-cyan-600' },
  sync: { icon: Upload, bg: 'bg-blue-700' },
};

const SIZES = {
  xs: { box: 'w-7 h-7 rounded-lg', icon: 'w-4 h-4' },
  sm: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5' },
  md: { box: 'w-11 h-11 rounded-xl', icon: 'w-6 h-6' },
  lg: { box: 'w-14 h-14 rounded-2xl', icon: 'w-7 h-7' },
} as const;

export function AppIcon({ name, size = 'md', className = '' }: { name: AppIconName; size?: keyof typeof SIZES; className?: string }) {
  const { icon: Glyph, bg } = ICONS[name];
  const s = SIZES[size];
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center text-white shadow-sm ${s.box} ${bg} ${className}`}>
      <Glyph className={s.icon} strokeWidth={2} />
    </span>
  );
}
