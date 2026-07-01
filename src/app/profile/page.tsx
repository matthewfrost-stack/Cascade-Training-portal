"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import UniformButton from "@/app/components/UniformButton";
import { supabase } from "@/lib/supabase";
import {
  PROFILE_PHOTOS_BUCKET,
  getProfileAvatarUrl,
  getProfileInitials,
} from "@/lib/profile";
import { useCurrentUserProfile } from "@/lib/useCurrentUserProfile";

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const maybeMessage = "message" in error ? error.message : null;
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  return fallback;
}

export default function ProfilePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [roleTier, setRoleTier] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const { profile, isAuthenticated, loading, refreshProfile } =
    useCurrentUserProfile();

  const avatarUrl = useMemo(
    () => getProfileAvatarUrl(avatarPath, process.env.NEXT_PUBLIC_SUPABASE_URL),
    [avatarPath],
  );

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      return;
    }

    if (!profile) return;

    setError(null);
    setUserId(profile.id);
    setFullName(profile.full_name || "");
    setEmail(profile.email || "");
    setPhoneNumber(profile.phone_number || "");
    setAvatarPath(profile.avatar_path || null);
    setRoleTier(profile.role_tier || null);
  }, [isAuthenticated, loading, profile, router]);

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || !userId) return;

    try {
      setUploading(true);
      setError(null);
      setMessage(null);

      const extension = file.name.includes(".")
        ? file.name.split(".").pop()
        : "png";
      const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from(PROFILE_PHOTOS_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || undefined,
        });

      if (uploadError) throw uploadError;

      setAvatarPath(filePath);
      setMessage("Profile picture uploaded. Save changes to keep it.");
    } catch (uploadError: unknown) {
      setError(
        getErrorMessage(uploadError, "Unable to upload profile picture."),
      );
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setMessage(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          phone_number: phoneNumber,
          avatar_path: avatarPath,
        }),
      });

      let result: any;
      try {
        result = await response.json();
      } catch {
        throw new Error("Invalid server response when saving profile.");
      }

      if (!response.ok) {
        throw new Error(
          result?.error || `Unable to save your profile. (${response.status})`,
        );
      }

      setFullName(result.profile?.full_name || fullName);
      setEmail(result.profile?.email || email);
      setPhoneNumber(result.profile?.phone_number || phoneNumber);
      setAvatarPath(result.profile?.avatar_path || avatarPath);
      setRoleTier(result.profile?.role_tier || roleTier);
      setMessage("Your profile has been updated.");
      await refreshProfile();
    } catch (saveError: unknown) {
      setError(getErrorMessage(saveError, "Unable to save your profile."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 pb-10 pt-24 text-slate-900 transition-colors dark:bg-[#0f172a] dark:text-white">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-950/50">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Loading your profile...
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 pb-10 pt-24 text-slate-900 transition-colors dark:bg-[#0f172a] dark:text-white">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950/50">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-6 dark:border-slate-800 dark:bg-slate-900/40 sm:px-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              My Profile
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Update your details
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Change your name, contact details, and profile picture.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8 p-6 sm:p-8">
            <div className="flex flex-col gap-5 rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-center">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-2xl font-black text-slate-700 dark:bg-[#1b2740] dark:text-slate-100">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt="Profile"
                    width={96}
                    height={96}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{getProfileInitials(fullName, email)}</span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">
                  {fullName || "Your profile"}
                </p>
                <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
                  {roleTier || "User"}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700">
                    {uploading ? "Uploading..." : "Upload photo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleAvatarUpload}
                      disabled={uploading}
                    />
                  </label>
                  {avatarPath ? (
                    <button
                      type="button"
                      onClick={() => setAvatarPath(null)}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Name
                </span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900"
                  placeholder="Your name"
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Email
                </span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900"
                  placeholder="you@example.com"
                  required
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Phone number
                </span>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  type="tel"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900"
                  placeholder="Add a contact number"
                />
              </label>
            </div>

            {message ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300">
                {message}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <UniformButton
                type="button"
                variant="secondary"
                onClick={() => router.push("/")}
              >
                Back to portal
              </UniformButton>
              <UniformButton type="submit" disabled={saving || uploading}>
                {saving ? "Saving..." : "Save profile"}
              </UniformButton>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
