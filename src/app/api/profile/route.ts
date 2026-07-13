import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/apiAuth";

type ProfileUpdatePayload = {
  full_name?: unknown;
  email?: unknown;
  phone_number?: unknown;
  avatar_path?: unknown;
};

function sanitizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

async function getAuthenticatedUser(request?: Request) {
  const authHeader =
    request?.headers.get("authorization") ||
    request?.headers.get("Authorization");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "").trim();

  let user: Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["getUser"]>>["data"]["user"] = null;
  let error: unknown = null;

  // Try the bearer token first.
  if (bearerToken) {
    const tokenClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        global: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
      },
    );

    const res = await tokenClient.auth.getUser();
    user = res.data.user;
    error = res.error;
  }

  // Fall back to the cookie session if the bearer token was missing or stale.
  // Without this, a client holding an expired access token gets a 401 here even
  // though its auth cookies are still valid — which left the user with a null
  // role (permissions off) while the cookie-backed data routes kept working.
  if (!user) {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No-op in route handlers.
          },
        },
      },
    );

    const res = await authClient.auth.getUser();
    user = res.data.user;
    error = user ? null : res.error || error;
  }

  return { data: { user }, error };
}

export async function GET(request: Request) {
  try {
    const {
      data: { user },
      error: authError,
    } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient();
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select(
        "id, full_name, email, phone_number, avatar_path, role_tier, password_needs_change",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile fetch error:", profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      profile: {
        id: user.id,
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        email: profile?.email || user.email || null,
        phone_number: profile?.phone_number || null,
        avatar_path: profile?.avatar_path || null,
        role_tier: profile?.role_tier || null,
        password_needs_change: profile?.password_needs_change || false,
      },
    });
  } catch (error) {
    console.error("Error in /api/profile GET:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Server error: ${errorMessage}` },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const {
      data: { user },
      error: authError,
    } = await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: ProfileUpdatePayload;
    try {
      body = (await request.json()) as ProfileUpdatePayload;
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload.' },
        { status: 400 },
      );
    }

    const fullName = sanitizeString(body.full_name, 120);
    const email = sanitizeString(body.email, 255);
    const phoneNumber = sanitizeString(body.phone_number, 50);
    const avatarPath = sanitizeString(body.avatar_path, 500);

    if (!fullName) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }

    if (avatarPath && !avatarPath.startsWith(`${user.id}/`)) {
      return NextResponse.json(
        { error: "Invalid avatar path." },
        { status: 400 },
      );
    }

    const service = createServiceClient();

    const authUpdate = await service.auth.admin.updateUserById(user.id, {
      email,
      user_metadata: {
        full_name: fullName,
      },
    });

    if (authUpdate.error) {
      return NextResponse.json(
        { error: authUpdate.error.message },
        { status: 400 },
      );
    }

    const updatePayload = {
      full_name: fullName,
      email,
      phone_number: phoneNumber,
      avatar_path: avatarPath,
    };

    const { data: profile, error: profileError } = await service
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id)
      .select("id, full_name, email, phone_number, avatar_path, role_tier")
      .single();

    if (profileError) {
      console.error("Profile update error:", profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 400 },
      );
    }

    if (!profile) {
      console.error("Profile update returned no data for user:", user.id);
      return NextResponse.json(
        { error: "Profile update failed to return data." },
        { status: 500 },
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Error in /api/profile PATCH:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Server error: ${errorMessage}` },
      { status: 500 },
    );
  }
}
