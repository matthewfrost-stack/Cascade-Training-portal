"use client";

import { useNavDrawer } from "@/app/components/NavDrawerProvider";
import { usePathname, useRouter } from "next/navigation";
import Icon from "./Icon";
import UniformButton from "./UniformButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProfileAvatarUrl, getProfileInitials } from "@/lib/profile";
import { useCurrentUserProfile } from "@/lib/useCurrentUserProfile";
import { signOutClientSide } from "@/lib/clientSignOut";

type ThemeMode = "light" | "dark" | "system";
type RoleTier = "staff" | "manager" | "scheduler" | "admin";

function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const theme = localStorage.getItem("theme");
  return theme === "light" || theme === "dark" ? theme : "system";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyThemeMode(mode: ThemeMode) {
  const useDark = mode === "dark" || (mode === "system" && systemPrefersDark());

  if (useDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  if (mode === "system") {
    localStorage.removeItem("theme");
  } else {
    localStorage.setItem("theme", mode);
  }

  window.dispatchEvent(
    new CustomEvent("themeChange", { detail: { isDark: useDark, mode } }),
  );
}



export default function FixedHeader() {
  const pathname = usePathname();
  const { toggle } = useNavDrawer();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const {
    profile,
    isAuthenticated: profileIsAuthenticated,
  } = useCurrentUserProfile();
  const fullName = profile?.full_name || "";
  const email = profile?.email || "";
  const roleTier = (profile?.role_tier as RoleTier | null) || null;
  const avatarPath = profile?.avatar_path || null;
  const avatarUrl = useMemo(
    () => getProfileAvatarUrl(avatarPath, process.env.NEXT_PUBLIC_SUPABASE_URL),
    [avatarPath],
  );

  useEffect(() => {
    setIsAuthenticated(profileIsAuthenticated);
  }, [profileIsAuthenticated]);

  useEffect(() => {
    setThemeMode(getStoredThemeMode());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (getStoredThemeMode() === "system") {
        applyThemeMode("system");
        setThemeMode("system");
      }
    };

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: ThemeMode }>;
      if (customEvent.detail?.mode) {
        setThemeMode(customEvent.detail.mode);
        return;
      }
      setThemeMode(getStoredThemeMode());
    };

    media.addEventListener("change", handleSystemThemeChange);
    window.addEventListener("themeChange", handleThemeChange as EventListener);

    return () => {
      media.removeEventListener("change", handleSystemThemeChange);
      window.removeEventListener(
        "themeChange",
        handleThemeChange as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    setIsProfileDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);



  const handleSignOut = async () => {
    try {
      await signOutClientSide();
    } catch (error) {
      console.error("Error signing out:", error);
      return;
    }
    setIsProfileDropdownOpen(false);
    router.replace("/login");
  };

  const handleSelectTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    applyThemeMode(mode);
  };

  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <UniformButton
          variant="secondary"
          className="no-ui-motion border p-2 shadow-sm"
          onClick={toggle}
          title="Menu"
          aria-label="Menu"
        >
          <Icon name="menu" className="h-6 w-6" />
        </UniformButton>

        <div className="flex-1" />

        <div className="relative flex items-center gap-2" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => {
              setIsProfileDropdownOpen((open) => !open);
            }}
            className="flex items-center gap-2 text-left"
            aria-haspopup="menu"
            aria-expanded={isProfileDropdownOpen}
          >
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-medium leading-none text-slate-900 dark:text-white">
                {fullName || email || "Profile"}
              </p>
              <p className="mt-1 truncate text-xs capitalize leading-none text-slate-500 dark:text-slate-400">
                {roleTier || "User"}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-black text-slate-700 shadow-inner dark:bg-[#1b2740] dark:text-slate-100">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{getProfileInitials(fullName, email)}</span>
              )}
            </div>
          </button>

          {isProfileDropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-slate-900 shadow-md dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
              <div className="px-2 py-1.5 text-sm font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">
                    {fullName || email || "Profile"}
                  </p>
                  {email ? (
                    <p className="text-xs leading-none text-slate-500 dark:text-slate-400">
                      {email}
                    </p>
                  ) : null}
                  <p className="text-xs capitalize leading-none text-slate-500 dark:text-slate-400">
                    {roleTier || "User"}
                  </p>
                </div>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    router.push("/");
                  }}
                  className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <Icon name="home" className="h-4 w-4" />
                  <span className="ml-2">Home</span>
                </button>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileDropdownOpen(false);
                    router.push("/profile");
                  }}
                  className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <Icon name="user" className="h-4 w-4" />
                  <span className="ml-2">My Profile</span>
                </button>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              <div className="px-2 py-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                Theme
              </div>

              <div>
                <div className="space-y-1">
                  {[
                    {
                      mode: "light" as const,
                      label: "Light",
                      icon: "sun" as const,
                    },
                    {
                      mode: "dark" as const,
                      label: "Dark",
                      icon: "moon" as const,
                    },
                    {
                      mode: "system" as const,
                      label: "System",
                      icon: "monitor" as const,
                    },
                  ].map((option) => {
                    const active = themeMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => handleSelectTheme(option.mode)}
                        className={`flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors ${
                          active
                            ? "bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white"
                            : "text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        <Icon name={option.icon} className="h-4 w-4" />
                        <span className="ml-2 flex-1 text-left">
                          {option.label}
                        </span>
                        {active && (
                          <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="-mx-1 my-1 h-px bg-slate-200 dark:bg-slate-800" />

              {isAuthenticated && (
                <div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-900 dark:hover:text-white"
                  >
                    <Icon name="logout" className="h-4 w-4" />
                    <span className="ml-2">Log out</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
