'use client';

import { useState, useEffect } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';
import { usePathname, useRouter } from 'next/navigation';
import { signOutClientSide } from '@/lib/clientSignOut';
import { useCurrentUserProfile } from '@/lib/useCurrentUserProfile';

export default function AppSidebar({ isDark }: { isDark: boolean }) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const { profile, loading: profileLoading } = useCurrentUserProfile();
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const apps: Array<{
    id: string;
    label: string;
    icon: IconName;
    path: string;
    description: string;
  }> = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: 'home',
      path: '/dashboard',
      description: 'Back to training home',
    },
    {
      id: 'expiry-checker',
      label: 'Course Expiry',
      icon: 'chevron-right',
      path: '/apps/expiry-checker',
      description: 'Track course certifications',
    },
    {
      id: 'booking-calendar',
      label: 'Booking Calendar',
      icon: 'chevron-right',
      path: '/apps/booking-calendar',
      description: 'Schedule & manage bookings',
    },
  ];

  const isStaff = !profileLoading && profile?.role_tier === 'staff';
  const visibleApps = isStaff
    ? apps.filter((app) => app.id === 'booking-calendar')
    : apps;
  const isAppRoute = pathname.startsWith('/apps/') || pathname.startsWith('/dashboard');

  const currentApp = apps.find(app => 
    pathname === app.path || 
    (pathname === '/' && app.id === 'dashboard') ||
    (pathname.startsWith(app.path) && app.id !== 'dashboard')
  );

  async function handleSignOut() {
    try {
      await signOutClientSide();
    } catch (error) {
      console.error('Error signing out:', error);
      return;
    }
    router.replace('/login');
  }
  useEffect(() => {
    // Close mobile sidebar when route changes
    setShowMobileSidebar(false);
  }, [pathname]);

  if (!isAppRoute) {
    return null;
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {showMobileSidebar && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen transition-all duration-300 z-40 ${
          isDark ? 'bg-gray-950 border-gray-800' : 'bg-white border-gray-200'
        } border-r flex flex-col w-64 ${
          isCollapsed ? 'lg:w-20' : ''
        } ${
          showMobileSidebar ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        {/* Header */}
        <div className={`p-4 border-b transition-colors duration-300 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <h2 className={`font-bold text-lg transition-colors duration-300 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Apps
              </h2>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`p-1 rounded hover:bg-gray-700 dark:hover:bg-gray-800 transition-colors duration-300 ${
                isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'
              }`}
              title={isCollapsed ? 'Expand' : 'Collapse'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Icon name="chevron-right" className={`w-5 h-5 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-180'}`} />
            </button>
            <button
              onClick={() => setShowMobileSidebar(false)}
              className="p-1 rounded lg:hidden"
              aria-label="Close sidebar"
            >
              <Icon name="close" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Apps List */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {visibleApps.map(app => (
            <button
              key={app.id}
              onClick={() => {
                router.push(app.path);
                setShowMobileSidebar(false);
              }}
              title={isCollapsed ? app.label : ''}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300 ${
                currentApp?.id === app.id
                  ? isDark
                    ? 'bg-blue-900 text-blue-100'
                    : 'bg-blue-100 text-blue-900'
                  : isDark
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <span className="text-xl"><Icon name={app.icon} className="w-6 h-6" /></span>
              {!isCollapsed && (
                <div className="text-left flex-1">
                  <p className="font-semibold text-sm">{app.label}</p>
                  <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{app.description}</p>
                </div>
              )}
            </button>
          ))}
        </nav>


      </aside>

      {/* Mobile Menu Toggle (for small screens) - positioned with safe area inset, smaller on mobile */}
      {!showMobileSidebar && (
        <button
          onClick={() => setShowMobileSidebar(true)}
          className={`fixed lg:hidden z-30 p-2 rounded-full shadow-md transition-all duration-300 sm:p-3 sm:shadow-lg ${
            isDark ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
          } text-white`}
          style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom))', left: 'calc(1.5rem + env(safe-area-inset-left))' }}
          title="Open sidebar"
          aria-label="Open sidebar"
        >
          <Icon name="menu" className="w-4 h-4 sm:w-6 sm:h-6" />
        </button>
      )}
    </>
  );
}
