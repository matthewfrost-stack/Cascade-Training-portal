# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

Cascade Portal is an internal Next.js 16 (App Router) training-compliance application backed by Supabase/PostgreSQL. It tracks staff training certifications, expiry dates, booking/scheduling, attendance, and administration across multiple locations.

## Commands

```bash
npm run dev                  # Start dev server (port 3000)
npm run build                # Production build (Turbopack)
npm run build:webpack        # Fallback production build with webpack
npm run lint                 # ESLint (Next.js + TypeScript rules)
npx tsc --noEmit             # Type-check without building (run before declaring any task done)
npm run test                 # Run all tests (routes + e2e)
npm run test:routes          # Verify all hardcoded routes have matching page/route files
npm run test:e2e             # Playwright e2e tests (auto-starts dev on port 3005)
npm run test:e2e:ui          # Playwright interactive UI mode
npx playwright test tests/e2e/smoke.spec.ts -g "test name"  # Run a single e2e test
```

## Architecture

**Framework**: Next.js 16+ App Router, React 19, TypeScript (strict), Tailwind CSS v4, Supabase Auth + RLS. Deployed on Vercel (auto-deploys `main`).

**Path alias**: `@/*` maps to `src/*` (configured in tsconfig.json).

### Key directories

- `src/app/` - App Router pages and API routes
- `src/app/components/` - Shared React components (~40 files)
- `src/app/api/` - Server-side API route handlers (~52 endpoints)
- `src/pages/api/matrix-headers.ts` - The only Pages Router API route
- `docs/archive/` - Historical one-off reports (not current guidance)
- `src/lib/` - Shared utilities and hooks
- `tests/e2e/` - Playwright test specs
- `scripts/verify-routes.mjs` - Route verification script
- `migrations/` - Supabase SQL migrations and dev schema setup
- `.agents/` - AI agent skills, workflows, and rules

### Auth & API pattern

All API routes use `requireRole()` from `src/lib/apiAuth.ts` for authentication and authorization:

```typescript
const authz = await requireRole(['admin', 'scheduler']);
if ('error' in authz) return authz.error;  // Returns 401 or 403
const { userId, role, service } = authz;
```

**`src/proxy.ts` does not run on `/api/*`**, so a route without its own auth check is public. Cron routes use `isAuthorizedCronHeader()` from `src/lib/cronAuth.ts`; the Sign In App webhook verifies an HMAC signature.

Location scoping is applied via `getScopedLocationIds()` — admins see all locations, other roles see only their assigned ones.

Client-side auth state comes from the `useCurrentUserProfile()` hook (`src/lib/useCurrentUserProfile.ts`), which handles session refresh, cross-tab sync, and graceful fallbacks.

### Role tiers

Four roles stored in `profiles.role_tier`: `staff`, `manager`, `scheduler`, `admin`. Permissions are defined centrally in `src/lib/permissions.ts` and checked via `hasPermission(userRole, 'PERMISSION_KEY', 'action')`.

### Schema switching (dev vs production)

`src/lib/apiAuth.ts` reads `NEXT_PUBLIC_VERCEL_ENV` to select the Supabase schema: `dev` for preview/development, `public` for production. Both schemas live in the same Supabase project. All tables use Row-Level Security policies.

**RLS rules:** the publishable (anon) key ships to every browser, so RLS is the only barrier for client-side queries. Never add a policy with `USING (true)` / `WITH CHECK (true)` for `public`/`anon` roles: permissive policies are OR'd, so one always-true policy overrides every stricter one. Scope new policies `TO authenticated` and check `current_user_role_tier()`. Apply schema changes to both `public` and `dev`, then run `migrations/verify-rls-lockdown.sql`; the only expected rows are the `current_user_role_tier` / `current_user_location_ids` helpers.

### Sign In App integration

`/api/integrations/sign-in-app/webhook` receives HMAC-signed webhooks when staff sign in at a physical device. It matches the visitor to a profile (by visitor ID, email, or name), then marks **all** their bookings for that day as attended. Attendance can also be recorded via the trainer kiosk register (`/api/attendance/kiosk`) or manually through the booking roster.

### Theme system

Dark/light mode via `.dark` class on `<html>`. Components listen for a custom `themeChange` DOM event. Dark mode is the default.

## Agent Rules (from `.agents/rules/mandatory-planning.md`)

These rules apply to every task:

1. **Plan before code** - Create an Implementation Plan listing files to `[NEW]` and `[MODIFY]` with descriptions. Wait for user approval before editing.
2. **Break down large tasks** - If touching >3 existing files, propose sub-tasks first.
3. **Keep changes additive** - Reuse existing components/utilities. Never delete working code unless explicitly asked. Stop if a change requires breaking an interface.
4. **Update PROJECT_SUMMARY.md** - After adding new pages, components, API routes, or features. Update the `*Last updated:*` date.
5. **Verify before closing** - Run `npx tsc --noEmit` and confirm zero errors.

## AGENTS.md Note

This project uses Next.js 16+ which has breaking changes from earlier versions. Read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches Next.js APIs or conventions.

## Key References

- `PROJECT_SUMMARY.md` - Detailed architecture, component tables, API route tables, data flow
- `README.md` - Feature overview, roles, routes
- `.agents/skills/` - Behavior guidelines (additive-development, training-ui-patterns, training-data-standards, feature-verifier)
- `.agents/workflows/new-training-component.md` - 4-step process for new components
