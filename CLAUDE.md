# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cascade Portal is an internal Next.js 16 (App Router) training-compliance application backed by Supabase/PostgreSQL. It tracks staff training certifications, expiry dates, booking/scheduling, attendance, and administration across multiple locations.

## Commands

```bash
npm run dev                  # Start dev server (port 3000)
npm run build                # Production build (uses --webpack flag)
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
- `src/app/components/` - Shared React components (~44 files)
- `src/app/api/` - Server-side API route handlers (~36 endpoints)
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

Location scoping is applied via `getScopedLocationIds()` — admins see all locations, other roles see only their assigned ones.

Client-side auth state comes from the `useCurrentUserProfile()` hook (`src/lib/useCurrentUserProfile.ts`), which handles session refresh, cross-tab sync, and graceful fallbacks.

### Role tiers

Four roles stored in `profiles.role_tier`: `staff`, `manager`, `scheduler`, `admin`. Permissions are defined centrally in `src/lib/permissions.ts` and checked via `hasPermission(userRole, 'PERMISSION_KEY', 'action')`.

### Schema switching (dev vs production)

`src/lib/apiAuth.ts` reads `NEXT_PUBLIC_VERCEL_ENV` to select the Supabase schema: `dev` for preview/development, `public` for production. All tables use Row-Level Security policies.

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
