import type { Metadata, Viewport } from "next";
import "./globals.css";
import FixedHeader from '@/app/components/FixedHeader';
import SlideOutNav from '@/app/components/SlideOutNav';
import SessionTimeout from '@/app/components/SessionTimeout';
import UpdateNotification from '@/app/components/UpdateNotification';
import { NavDrawerProvider } from '@/app/components/NavDrawerProvider';
import { CurrentUserProfileProvider } from '@/lib/useCurrentUserProfile';

export const metadata: Metadata = {
  title: "Cascade Training Portal",
  description: "Management and Analytics Dashboard",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark')
            } else {
              document.documentElement.classList.remove('dark')
            }
          } catch (_) {}
        `}} />
      </head>
      <body className="font-sans antialiased bg-white text-slate-900 dark:bg-[#0f172a] dark:text-white min-h-screen overflow-x-hidden">
        <NavDrawerProvider>
          <CurrentUserProfileProvider>
            {/* App chrome (header, menus, pop-ups) is left out when printing / saving as PDF. */}
            <div className="print:hidden">
              <SessionTimeout />
              <UpdateNotification />
              <FixedHeader />
              <SlideOutNav />
            </div>
            {/* Main content area with top padding for fixed header and left padding for side emoji rail */}
            <div id="app-scroll" className="min-h-screen pt-14 pl-16 print:min-h-0 print:p-0">
              {children}
            </div>
          </CurrentUserProfileProvider>
        </NavDrawerProvider>
      </body>
    </html>
  );
}
