# Cascade Portal – Project Summary

> A concise reference document covering what this application does, how it is structured, and where to find key code. Read this first before diving into any specific area of the codebase.

---

## 1. What Is This App?

**Cascade Portal** is an internal web application for managing staff training compliance across multiple locations. It lets administrators, schedulers, and managers:

- Track which staff members hold which training certifications.
- Monitor upcoming expiry dates and flag staff who are overdue.
- Book and manage training events via a shared calendar.
- Sync training records from external systems (Atlas CSV import).
- Manage staff accounts, locations, and course definitions.

The application is branded as "Cascade Portal" and is accessed via a tile-based home screen after login.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 15+ (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS (dark/light theme toggle) |
| **Database / Auth** | Supabase (PostgreSQL + Row-Level Security) |
| **Deployment** | Vercel (auto-deploys from `main` branch) |
| **Email** | Custom email utility via `src/lib/email.ts` |

---

## 3. Project Structure

```
training-portal/
├── src/
│   ├── app/                    # All Next.js App Router pages & API routes
│   │   ├── page.tsx            # Landing page (home tile selector)
│   │   ├── layout.tsx          # Root layout (sidebar, update notifier, auth)
│   │   ├── dashboard/          # Training hub – links to all sub-apps
│   │   ├── admin-tools/        # Admin-only management panel
│   │   ├── training-matrix/    # Full staff × course compliance matrix
│   │   ├── apps/
│   │   │   ├── booking-calendar/      # Course booking and scheduling
│   │   │   ├── expiry-checker/        # Single-location expiry checker
│   │   │   └── training-course-checker/ # TNA (Training Needs Analysis) checker
│   │   ├── analytics/          # Reporting and analytics views
│   │   ├── auth/               # Login, password-change flows
│   │   ├── profile/            # User profile page
│   │   ├── feedback/           # Feedback form for post-training reviews
│   │   ├── components/         # Shared React components (see §5)
│   │   └── api/                # All Next.js API routes (see §6)
│   ├── lib/                    # Shared utilities and hooks
│   │   ├── supabase.ts         # Supabase client singleton
│   │   ├── permissions.ts      # Role-based permission definitions
│   │   ├── useCurrentUserProfile.ts  # Auth + profile hook
│   │   ├── email.ts            # Email sending utility
│   │   ├── apiAuth.ts          # Server-side API auth helper
│   │   └── useAsync.ts         # Generic async state hook
│   ├── middleware.ts            # Route protection middleware
│   └── pages/                  # Legacy Next.js pages dir (minimal use)
├── .agents/skills/             # AI agent customisation rules (see §8)
├── PROJECT_SUMMARY.md          # ← You are here
└── package.json
```

---

## 4. Core Concepts

### Role Tiers
Every user has a `role_tier` stored in the `profiles` Supabase table. There are four tiers, from least to most privileged:

| Role | Typical capabilities |
|---|---|
| `staff` | View roster, view bookings, view own profile |
| `manager` | Above + view courses |
| `scheduler` | Above + create/delete bookings, edit roster |
| `admin` | Full access including staff management, admin tools |

Permissions are declared centrally in `src/lib/permissions.ts` and checked everywhere via `hasPermission(userRole, 'PERMISSION_KEY', 'action')`.

### Theme
The app supports dark and light modes. The active theme is stored as a class on `<html>` (`.dark`). Components listen for a custom `themeChange` DOM event to re-render on toggle. Dark mode is the default.

### Auth & Session Synchronization Across Windows/Tabs
Client auth state and role permissions are managed via `useCurrentUserProfile()` (`src/lib/useCurrentUserProfile.ts`).
- **Session Auto-Refresh**: Tokens approaching expiration are automatically refreshed via `supabase.auth.refreshSession()`.
- **Window/Tab Focus Sync**: Subscribes to `visibilitychange`, `focus`, and `storage` events to ensure user role permissions and access rights remain active when switching between browser windows and tabs without getting reset or lost.
- **Graceful Fallbacks**: If the `/api/profile` endpoint encounters transient network errors, active session state is preserved so permission checks do not crash or flash "Access Denied".

---

## 5. Key Pages

### Home & Training Dashboard (`/` & `/dashboard`)
`src/app/page.tsx`

The root landing page after login is the **Training Dashboard**. It displays a responsive grid of cards leading directly to all core training tools:
1. **Matrix Sync** – opens an import modal (admin view)
2. **Training Matrix** – `/training-matrix`
3. **Course Expiry Checker** – `/apps/expiry-checker`
4. **Booking Calendar** – `/apps/booking-calendar`

Navigation across all pages includes an **always-visible side emoji strip** on the left screen edge (🏠 Home, 📊 Matrix, 📆 Calendar, 📅 Expiry, 🛠️ Admin) and compact drawer buttons when expanded.
3. **Course Expiry Checker** – `/apps/expiry-checker`
4. **Booking Calendar** – `/apps/booking-calendar`

---

### Training Matrix (`/training-matrix`)
`src/app/training-matrix/components/MatrixLayout.tsx`

The most complex view. Displays every staff member's training status across all courses and locations.

**Key features:**
- Filterable by location, course, and staff name.
- Colour-coded compliance cells (green = valid, amber = expiring, red = expired).
- Summary metric cards at the top showing counts (expiring, expired, action required, allocated) — **hovering a card shows a popover** listing exactly who is in that category with dates, and **clicking opens a drill-down modal**.
- Inline date editing, override notes, and bulk update tools.
- State is managed via `MatrixContext` (`src/app/training-matrix/context/`).

---

### Course Expiry Checker (`/apps/expiry-checker`)
`src/app/components/CourseExpiryChecker.tsx`

Displays expiring and expired certifications for a selected location. Used for day-to-day compliance checking.

---

### Training Course Checker / TNA (`/apps/training-course-checker`)
`src/app/components/TrainingCourseChecker.tsx`

The Training Needs Analysis (TNA) tool. Aggregates training records across the whole organisation.

**Key features:**
- Summary stats (expiring soon, already expired, etc.) — **hovering shows a popover** with names and dates; **clicking expands a full detail modal**.
- Course-level breakdown and location filters.
- Data is fetched from `/api/courses/expiring` and related endpoints, then mapped into a normalised structure using `ensureCourse` / `ensureLocation` helpers.

---

### Booking Calendar (`/apps/booking-calendar`)
`src/app/apps/booking-calendar/CalendarPage.tsx`

A calendar interface for creating and managing training events.

**Key features:**
- Monthly / weekly calendar view.
- Create bookings with course, location, date, time, and max capacity.
- Attach staff members to bookings (booking modal with roster).
- Email notifications on booking confirmation or cancellation.
- Attendance marking.

---

### Admin Tools (`/admin-tools`)
`src/app/admin-tools/page.tsx`

Admin-only panel containing sub-tools managed by `AdminToolsPanel.tsx`:
- **Staff Management** – add, edit, delete users; manage locations per user.
- **Location Manager** – create/rename locations.
- **Course Manager** – define courses, set default expiry durations.
- **Duplicate Removal** – find and merge duplicate staff records.
- **Automation Control** – configure scheduled jobs (e.g. feedback email triggers).
- **Atlas Import** – import training records from external Atlas CSV exports.
- **Email Debug** – test and preview email configuration.

---

## 6. Shared Components (`src/app/components/`)

| Component | Purpose |
|---|---|
| `AppSidebar.tsx` | Collapsible left-side navigation bar |
| `FixedHeader.tsx` | Top header with theme toggle and profile dropdown |
| `TrainingCourseChecker.tsx` | TNA summary + drill-down (see §5) |
| `CourseExpiryChecker.tsx` | Per-location expiry view |
| `RecordHoverPopoverModal.tsx` | Reusable hover popover + click-to-expand modal for record lists |
| `AddStaffModal.tsx` | Multi-step modal for creating a new staff member |
| `BookingModal.tsx` | Create/edit training booking events |
| `AdminToolsPanel.tsx` | Admin sub-panel container |
| `UpdateNotification.tsx` | Polls `/api/version` and shows a toast when a new deploy is detected |
| `MatrixSyncModal.tsx` | Import options: Atlas upload or location CSV |
| `LocationManagerModal.tsx` | CRUD for locations |
| `CourseManagerModal.tsx` | CRUD for course definitions |
| `DuplicateRemovalModal.tsx` | Detect and merge duplicate staff records |
| `SlideOutNav.tsx` | Mobile-friendly slide-out navigation |
| `ThemeToggle.tsx` | Dark/light mode switcher |

---

## 7. API Routes (`src/app/api/`)

All routes are Next.js Route Handlers (server-side). Authentication is checked server-side using `src/lib/apiAuth.ts`.

| Route | Purpose |
|---|---|
| `/api/staff` | Get all staff profiles |
| `/api/add-staff` | Create a new staff member (and Supabase auth user) |
| `/api/delete-staff` | Delete a staff member |
| `/api/profile` | Get/update the current user's profile |
| `/api/locations` | List and manage locations |
| `/api/courses` | List course definitions |
| `/api/courses/expiring` | Get all certifications expiring within N days |
| `/api/update-course` | Update a training record (completion date, expiry, override) |
| `/api/bulk-update-training` | Batch update multiple training records |
| `/api/training-matrix` | Fetch the full matrix data for the Training Matrix view |
| `/api/book-staff` | Add a staff member to a booking |
| `/api/roster` | Get the attendance roster for a booking |
| `/api/send-booking-confirmation` | Send a confirmation email for a booking |
| `/api/send-booking-cancellation` | Send a cancellation email |
| `/api/send-course-notification` | Send a general course notification email |
| `/api/email-logs` | Retrieve email send history |
| `/api/atlas/import` | Parse and import an Atlas CSV export |
| `/api/automations` | Configure/trigger automation jobs |
| `/api/version` | Returns current build timestamp (used by UpdateNotification) |
| `/api/admin` | Admin-level queries (staff + location joins) |
| `/api/archive` | Archive old or inactive records |
| `/api/cleanup-orphaned-profiles` | Remove profile rows with no matching auth user |

---

## 8. Authentication & Middleware

`src/middleware.ts` intercepts all requests. Unauthenticated users are redirected to `/login`. The middleware reads the Supabase session cookie server-side.

User profile data (including `role_tier`) is fetched client-side using the `useCurrentUserProfile` hook, which caches the profile for the session.

Password change enforcement: if `profile.password_needs_change === true`, the user is redirected to `/auth/change-password-required` on every page load until they set a new password.

---

## 9. Data Flow – Training Records

```
Supabase DB
  └── training_records table
        (staff_id, course_id, location_id, completion_date, expiry_date, override_note)
              │
              ├── /api/training-matrix  →  MatrixLayout.tsx  (grid: all staff × all courses)
              ├── /api/courses/expiring →  TrainingCourseChecker.tsx  (TNA / expiry dashboard)
              └── /api/courses/expiring →  CourseExpiryChecker.tsx  (per-location view)
```

External data can be imported via:
- **Atlas CSV** – `/api/atlas/import` parses the CSV and upserts records.
- **Location CSV** – via `MatrixSyncModal`, uploads per-location training exports.

---

## 10. Agent Configuration (`.agents/`)

Three categories of AI agent configuration live here:

### Skills (`.agents/skills/`)
Tell the agent *how* to behave for specific categories of work.

| Skill | When to use |
|---|---|
| `additive-development` | Adding any new feature – never break existing code |
| `training-ui-patterns` | Building UI components for training/progress screens |
| `training-data-standards` | Modifying user progress, course state, or backend endpoints |
| `feature-verifier` | After implementing a feature – verify build passes |

### Workflows (`.agents/workflows/`)
Give the agent a precise, step-by-step checklist for repeatable tasks.

| Workflow | Purpose |
|---|---|
| `new-training-component.md` | 4-step process: inspect types → draft isolated component → wire import → verify build |

Usage: *"Run the new-training-component workflow for a QuizCard element."*

### Rules (`.agents/rules/`)
Always-on workspace constraints that apply to every agent invocation.

| Rule file | Effect |
|---|---|
| `mandatory-planning.md` | Forces an Implementation Plan before any code changes; limits task scope to ≤3 files; requires `PROJECT_SUMMARY.md` to be updated after every feature addition |

---

## 11. Common Development Tasks

### Run locally
```bash
npm run dev
```

### Type-check without building
```bash
npx tsc --noEmit
```

### Deploy
Push to `main` — Vercel auto-deploys.

### Add a new API endpoint
1. Create `src/app/api/<name>/route.ts`
2. Import `apiAuth` from `src/lib/apiAuth.ts` to validate the session server-side
3. Add it to the API table in §7 above

### Add a new staff role permission
Edit `src/lib/permissions.ts` — all permission gates read from here.

---

---

## 12. Project Root Config Files

| File | Purpose |
|---|---|
| `.agentignore` | Blocks AI agents from scanning `node_modules/`, `.next/`, `dist/`, secrets, logs, and media files |
| `PROJECT_SUMMARY.md` | This file – must be kept current after every feature addition |
| `middleware.ts` | Supabase session guard applied to all routes |
| `next.config.ts` | Next.js build configuration |
| `tailwind.config.ts` | Tailwind theme and content paths |
| `tsconfig.json` | TypeScript compiler options |

---

*Last updated: 2026-07-27*
