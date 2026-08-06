"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Icon from "@/app/components/Icon";
import UniformButton from "@/app/components/UniformButton";
import { hasPermission } from "@/lib/permissions";
import { useNavDrawer } from "@/app/components/NavDrawerProvider";
import { useCurrentUserProfile } from "@/lib/useCurrentUserProfile";

export default function SlideOutNav() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { isOpen, close } = useNavDrawer();

  const [trainingOpen, setTrainingOpen] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const { profile, isAuthenticated, loading } = useCurrentUserProfile();
  const userRole = profile?.role_tier ?? null;

  const canAdminTools = useMemo(
    () => !loading && hasPermission(userRole, "STAFF_MANAGEMENT", "canView"),
    [userRole, loading],
  );

  useEffect(() => {
    if (!pathname) return;
    const isAdminPath =
      pathname === "/admin-tools" ||
      pathname.startsWith("/admin-tools/") ||
      pathname === "/admin" ||
      pathname.startsWith("/admin/");

    if (isAdminPath) {
      setTrainingOpen(false);
      setAdminOpen(true);
      return;
    }

    setTrainingOpen(true);
    setAdminOpen(false);
  }, [pathname]);

  if (pathname === "/login" || pathname === "/auth/callback") {
    return null;
  }

  const go = (path: string) => {
    close();
    router.push(path);
  };

  const isHome = pathname === "/" || pathname === "/dashboard";
  const isMatrix = pathname === "/training-matrix" || pathname.startsWith("/training-matrix/");
  const isCalendar = pathname.startsWith("/apps/booking-calendar");
  const isExpiry = pathname.startsWith("/apps/expiry-checker");
  const isAdmin = pathname.startsWith("/admin");

  return (
    <>
      {/* Always-visible vertical side emoji strip on the left screen edge */}
      <div className="fixed left-0 top-14 bottom-0 z-40 w-16 border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 flex flex-col items-center py-4 gap-3">
        <button
          type="button"
          onClick={() => go("/")}
          title="Training Dashboard"
          className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl transition-all duration-200 ${
            isHome
              ? "bg-blue-100 dark:bg-blue-950/80 border-blue-500 dark:border-blue-400 shadow-sm"
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-900 opacity-80 hover:opacity-100"
          }`}
        >
          🏠
        </button>

        <button
          type="button"
          onClick={() => go("/training-matrix")}
          title="Training Matrix"
          className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl transition-all duration-200 ${
            isMatrix
              ? "bg-purple-100 dark:bg-purple-950/80 border-purple-500 dark:border-purple-400 shadow-sm"
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-900 opacity-80 hover:opacity-100"
          }`}
        >
          📊
        </button>

        <button
          type="button"
          onClick={() => go("/apps/booking-calendar")}
          title="Booking Calendar"
          className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl transition-all duration-200 ${
            isCalendar
              ? "bg-emerald-100 dark:bg-emerald-950/80 border-emerald-500 dark:border-emerald-400 shadow-sm"
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-900 opacity-80 hover:opacity-100"
          }`}
        >
          📆
        </button>

        <button
          type="button"
          onClick={() => go("/apps/expiry-checker")}
          title="Course Expiry Checker"
          className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl transition-all duration-200 ${
            isExpiry
              ? "bg-blue-100 dark:bg-blue-950/80 border-blue-500 dark:border-blue-400 shadow-sm"
              : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-900 opacity-80 hover:opacity-100"
          }`}
        >
          📅
        </button>

        {canAdminTools && (
          <button
            type="button"
            onClick={() => go("/admin-tools")}
            title="Admin Tools"
            className={`w-10 h-10 rounded-xl border-2 flex items-center justify-center text-xl transition-all duration-200 ${
              isAdmin
                ? "bg-slate-200 dark:bg-slate-800 border-slate-500 dark:border-slate-400 shadow-sm"
                : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-900 opacity-80 hover:opacity-100"
            }`}
          >
            🛠️
          </button>
        )}
      </div>

      {/* Expanded Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[1100]">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={close} />
          <aside className="absolute left-0 top-0 h-full w-[88vw] max-w-xs sm:max-w-sm border-r border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-800 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Menu Navigation
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {loading
                    ? "Loading profile..."
                    : isAuthenticated
                      ? `Signed in (${userRole || "User"})`
                      : "Not signed in"}
                </p>
              </div>
              <UniformButton
                variant="secondary"
                size="sm"
                onClick={close}
                className="no-ui-motion p-2 shadow-md border"
                aria-label="Close menu"
                title="Close"
              >
                <Icon name="close" className="w-5 h-5" />
              </UniformButton>
            </div>

            <nav className="p-4 overflow-y-auto flex-1">
              <div className="grid gap-3">
                {/* Home/Dashboard Button */}
                <button
                  type="button"
                  onClick={() => go("/")}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left border ${
                    isHome
                      ? "bg-blue-50 border-blue-300 dark:bg-blue-950/60 dark:border-blue-800 font-semibold"
                      : "bg-slate-50/60 border-slate-200/80 dark:bg-slate-900/40 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                  }`}
                >
                  <span className="text-2xl shrink-0">🏠</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                      Dashboard
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Main training tools hub
                    </p>
                  </div>
                </button>

                {/* Training Section */}
                <section className="rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setTrainingOpen((v) => !v)}
                    aria-expanded={trainingOpen}
                    className="w-full text-left p-3.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Training Apps
                        </p>
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {trainingOpen ? "Hide" : "Show"}
                      </span>
                    </div>
                  </button>

                  {trainingOpen && (
                    <div className="p-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() => go("/training-matrix")}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border ${
                          isMatrix
                            ? "bg-purple-50 border-purple-300 dark:bg-purple-950/60 dark:border-purple-800 font-semibold"
                            : "bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-xl shrink-0">📊</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                            Training Matrix
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Staff training records
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => go("/apps/booking-calendar")}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border ${
                          isCalendar
                            ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/60 dark:border-emerald-800 font-semibold"
                            : "bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-xl shrink-0">📆</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                            Booking Calendar
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Schedule and bookings
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => go("/apps/expiry-checker")}
                        className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border ${
                          isExpiry
                            ? "bg-blue-50 border-blue-300 dark:bg-blue-950/60 dark:border-blue-800 font-semibold"
                            : "bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        }`}
                      >
                        <span className="text-xl shrink-0">📅</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                            Course Expiry
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            Expiring & expired
                          </p>
                        </div>
                      </button>
                    </div>
                  )}
                </section>

                {/* Admin Section */}
                {canAdminTools && (
                  <section className="rounded-2xl border border-slate-200 shadow-sm dark:border-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setAdminOpen((v) => !v)}
                      aria-expanded={adminOpen}
                      className="w-full text-left p-3.5 bg-slate-50/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 transition-colors hover:bg-slate-100 dark:hover:bg-slate-900"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Admin Tools
                          </p>
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {adminOpen ? "Hide" : "Show"}
                        </span>
                      </div>
                    </button>

                    {adminOpen && (
                      <div className="p-3 grid gap-2">
                        <button
                          type="button"
                          onClick={() => go("/admin-tools?open=staff")}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="text-xl shrink-0">🛠️</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              Manage Staff
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              Create & assign staff
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => go("/admin-tools?open=notifications")}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="text-xl shrink-0">🔔</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              Notifications
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              Email logs & mode
                            </p>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => go("/admin-tools?open=housekeeping")}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left border bg-white border-slate-200/80 dark:bg-slate-900/20 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900"
                        >
                          <span className="text-xl shrink-0">🧹</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                              Housekeeping
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              Duplicate cleanup & archive
                            </p>
                          </div>
                        </button>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
