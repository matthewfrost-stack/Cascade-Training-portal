# Cascade Portal – Project Summary

> A concise reference document covering what this application does, how it is structured, and where to find key code. Read this first before diving into any specific area of the codebase.

---

## 1. What Is This App?

**Cascade Portal** is an internal web application for managing staff training compliance across multiple locations. It lets administrators, schedulers, and managers:

- Track which staff members hold which training certifications.
- Monitor upcoming expiry dates and flag staff who are overdue.
- Book and manage training events via a shared calendar.
- Set per-session booking limits and roster messages from the booking roster.
- Display training venues directly on booking calendar event cards.
- Maintain reusable booking checklist templates, including removing obsolete items.
- Sync training records from external systems (Atlas CSV import, Atlas auto-sync cron, iHasco sync).
- Record attendance automatically via Sign In App webhook integration.
- Record attendance manually via trainer kiosk register.
- Track NVQ and Diploma qualification leads with timeline events.
- Manage staff accounts, locations, and course definitions.

The application is branded as "Cascade Portal" and is accessed via a tile-based home screen after login.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | Next.js 16+ (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS (dark/light theme toggle) |
| **Database / Auth** | Supabase (PostgreSQL + Row-Level Security) |
| **Deployment** | Vercel (auto-deploys from `main` branch) |
| **Email** | Custom email utility via `src/lib/email.ts` (exports `escapeHtml`, `formatTime`, send helpers) |

---

## 3. Project Structure

```
training-portal/
├── src/
│   ├── app/                    # All Next.js App Router pages & API routes
│   │   ├── page.tsx            # Landing page (home tile selector)
│   │   ├── layout.tsx          # Root layout (sidebar, update notifier, auth)
│   │   ├── dashboard/          # Training hub – links to all sub-apps
│   │   ├── admin/              # Admin and scheduler training control centre
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
- Event cards show course, training venue, date/time, and current capacity.
- Create bookings with course, location, date, time, and max capacity.
- Attach staff members to bookings (booking modal with roster).
- Admins and schedulers can use roster Settings to set a date-specific booking limit and a message shown at the top of the roster.
- Booking limits reuse `course_event_overrides`; roster messages reuse `training_events.notes`.
- Email notifications on booking confirmation or cancellation.
- Attendance, absence, lateness, staff removal, and CSV export.
- Both the Add Staff and Roster tabs group staff by location with collapsible sticky headers that stay visible while scrolling.

---

### Training Control Centre (`/admin`)
`src/app/admin/page.tsx`

Admin and scheduler-facing control centre with admin-only management tools:
- **Location Manager** – create and manage training locations, including each home's managers' email (Google Group) for the monthly training-due email and who regulates it (CQC or Ofsted).
- **Manager Emails** – see each home's expired / expiring / allocated counts, send yourself a preview, or send this month's emails on demand (`ManagerDigestModal`).
- **Course Catalogue** – define courses and set default capacity. Date-specific limits are managed from the booking roster.
- **Checklist Template** – add, edit, reorder, activate/deactivate, configure invoice inputs, and remove checklist items.
- **Automation Control** – configure scheduled jobs (e.g. feedback email triggers).

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
| `BookingModal.tsx` | Booking form, roster, attendance, export, roster settings; both tabs have collapsible sticky location headers |
| `RosterSettingsModal.tsx` | Edit per-session booking limits and roster messages |
| `ChecklistTemplateModal.tsx` | Manage reusable checklist items, including removal |
| `AdminToolsPanel.tsx` | Admin sub-panel container |
| `UpdateNotification.tsx` | Polls `/api/version` and shows a toast when a new deploy is detected |
| `MatrixSyncModal.tsx` | Import options: Atlas upload or location CSV |
| `ManagerDigestModal.tsx` | Admin view of the monthly manager email: per-home counts, preview to self, send now |
| `LocationManagerModal.tsx` | CRUD for locations |
| `CourseManagerModal.tsx` | CRUD for course definitions |
| `DuplicateRemovalModal.tsx` | Detect and merge duplicate staff records |
| `SlideOutNav.tsx` | Mobile-friendly slide-out navigation |
| `SessionTimeout.tsx` | Inactivity auto-logout with 60-second countdown warning modal |
| `ThemeToggle.tsx` | Dark/light mode switcher |

---

## 7. API Routes (`src/app/api/`)

All routes are Next.js Route Handlers (server-side). Authentication is checked server-side using `src/lib/apiAuth.ts`.

| Route | Auth | Purpose |
|---|---|---|
| `/api/add-staff` | admin | Create a new staff member (auth user + profile + matrix init with retry) |
| `/api/delete-staff` | admin | Delete a staff member |
| `/api/force-delete-profile` | admin | Force-remove a profile and auth user |
| `/api/profile` | session | Get/update the current user's profile (rollback-safe email sync) |
| `/api/admin/reset-user-password` | admin | Admin sets a user's password directly |
| `/api/auth/sign-out` | none | Revoke token and clear auth cookies |
| `/api/auth/change-password` | session | User changes own password |
| `/api/auth/complete-password-change` | session | Clear the `password_needs_change` flag after forced password change |
| `/api/auth/forgot-password` | **public** | Self-service reset: always replies the same, sends the email after the response (`after()`); max 3 per address per hour (from `email_logs`) plus a soft per-IP limit |
| `/api/courses/expiring` | all roles | Get certifications expiring within N days |
| `/api/courses/expired` | all roles | Get expired certifications |
| `/api/courses/by-location` | all roles | Get courses for a location |
| `/api/courses/locations` | all roles | Get course/location data |
| `/api/courses/allocated-training` | all roles | Get allocated training records |
| `/api/update-course` | admin | Update a training record (completion date, expiry, override) |
| `/api/bulk-update-training` | admin+ | Batch update multiple training records |
| `/api/training-matrix` | all roles | Fetch the full matrix data (location-scoped) |
| `/api/training-matrix/records` | all roles | Fetch individual training records (location-scoped) |
| `/api/training-matrix/bootstrap` | all roles | Bootstrap matrix data for a location |
| `/api/training-matrix/import-csv` | admin | Import training matrix from CSV |
| `/api/reports/compliance` | admin/scheduler/manager | Compliance overview (all scoped homes) or one home (`?locationId=`), hours for `from`/`to` |
| `/api/reports/compliance/snapshot` | admin/scheduler | `POST { locationId, note? }`: take a check snapshot of one home (kept; never overwritten) |
| `/api/training-matrix/history/restore` | admin/scheduler | Put a matrix cell back to its values before one history entry |
| `/api/training-matrix/history` | admin/scheduler/manager | History of one matrix cell (person + course incl. Careskills copy + home), newest first, location-scoped |
| `/api/training-matrix/staff-group` | admin+ | Manage staff groups in the matrix |
| `/api/book-staff` | admin/scheduler/manager | Add staff to a booking (manager location-scoped) |
| `/api/booking-calendar` | all roles | Fetch booking calendar events |
| `/api/booking-calendar/summary` | all roles | Fetch calendar summary view |
| `/api/attendance/kiosk` | admin/scheduler | Mark attendance via trainer kiosk register |
| `/api/roster/export` | admin/scheduler | Export scoped roster data as CSV |
| `/api/admin/checklist-template` | admin | Manage reusable checklist templates |
| `/api/send-booking-confirmation` | admin/scheduler | Send a confirmation email for a booking |
| `/api/send-booking-cancellation` | admin/scheduler | Send a cancellation email |
| `/api/send-course-notification` | admin/scheduler | Send a general course notification email |
| `/api/email/send` | admin/scheduler | Send an arbitrary email (generic error response, no SMTP leak) |
| `/api/email-logs` | admin/scheduler | Retrieve email send history |
| `/api/atlas/import` | admin | Parse and import an Atlas Excel export (schema-aware) |
| `/api/atlas/sync` | cron/admin | Auto-sync training records from Atlas |
| `/api/integrations/sign-in-app/webhook` | HMAC | Receive Sign In App webhooks, mark all daily bookings as attended |
| `/api/automations/feedback-emails` | cron/admin | Send feedback/reminder emails (duplicate-safe) |
| `/api/automations/roster-no-shows` | cron/admin | Send no-show notifications to admins |
| `/api/automations/manager-digest` | cron/admin | Monthly training-due email to each home's managers (GET+cron = send; POST `{action: status\|preview\|send}` for admins) |
| `/api/qualifications` | admin/manager/scheduler | List and create NVQ/Diploma qualification leads (location-scoped) |
| `/api/qualifications/[id]` | admin/manager/scheduler | Update or delete a qualification lead (location-scoped) |
| `/api/qualifications/[id]/timeline` | admin/manager/scheduler | Add timeline events to a qualification lead |
| `/api/staff/by-location` | all roles | Get staff for a location (staff see only themselves) |
| `/api/locations/user-locations` | all roles | Get locations the user has access to |
| `/api/remove-staff-from-location` | admin/scheduler | Remove a staff member from a location |
| `/api/archive` | admin | Archive old or inactive records |
| `/api/archive/delete-booking` | admin/scheduler | Delete an archived booking |
| `/api/archive/remove-location-course` | admin/scheduler | Remove a course from a location |
| `/api/cleanup-orphaned-profiles` | admin | Remove profile rows with no matching auth user |
| `/api/send-password-reset` | admin | Send a password reset email to a staff member |
| `/api/test-email` | admin/scheduler | Send a test email to verify SMTP configuration |
| `/api/debug-email-config` | admin | Inspect email configuration (masked values) |
| `/api/debug-profiles` | admin | Inspect profile data for debugging |
| `/api/version` | none | Returns current build timestamp (used by UpdateNotification) |

---

## 8. Authentication & Middleware

`src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) intercepts page requests. Unauthenticated users are redirected to `/login`. The proxy reads the Supabase session cookie server-side.

**The proxy skips `/api/*`** (see its `matcher`), so every API route must authenticate itself — `requireRole()` for App Router routes, a session check for the one Pages Router route (`src/pages/api/matrix-headers.ts`), `isAuthorizedCronHeader()` for cron, HMAC for the Sign In App webhook.

User profile data (including `role_tier`) is fetched client-side using the `useCurrentUserProfile` hook, which caches the profile for the session.

Session timeout: after 5 minutes of inactivity a warning modal appears with a 60-second countdown. Users can extend the session or log out immediately. If the countdown reaches zero, the user is signed out and redirected to `/login`. The timeout is shared across tabs via `localStorage`.

Password change enforcement: if `profile.password_needs_change === true`, the user is redirected to `/auth/change-password-required` on every page load until they set a new password.

**Password emails** (`src/lib/passwordLinks.ts`, `sendPasswordResetEmail()` in `src/lib/email.ts`): admin resets, new-staff welcome emails and the login page's "Forgotten your password?" all send a one-time Supabase *recovery* link to `/auth/confirm?token_hash=…`. That page only uses the token when the person presses **Set my password** (so Outlook Safe Links can't use it up), then sends them to `/auth/set-password`. Both password pages use `src/app/auth/SetPasswordForm.tsx`. The link's base URL comes from env vars (`VERCEL_BRANCH_URL` on previews, then `NEXT_PUBLIC_APP_URL`, then `VERCEL_PROJECT_PRODUCTION_URL`), never the request Host header. Old-style links that reach `/auth/callback` without a code are sent to `/auth/forgot-password?expired=1`.

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
- **Atlas Auto-Sync** – `/api/atlas/sync` runs on a cron schedule to pull the latest completions.
- **iHasco Sync** – syncs iHasco training completions into the matrix.
- **Location CSV** – via `MatrixSyncModal`, uploads per-location training exports.

### Attendance Flow

Attendance can be recorded three ways:
1. **Sign In App** (automatic) – Staff sign in at a physical device. The webhook (`/api/integrations/sign-in-app/webhook`) matches the visitor to a profile and marks all their bookings for that day as attended.
2. **Kiosk Register** (trainer) – Trainers use `/apps/booking-calendar/kiosk?eventId=...` to manually mark attendance per event.
3. **Manual** – Via the booking roster in the calendar.

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

## 11. Current Development Status

### Qualification evidence – certificates (2026-11-18)
- Marking someone **Completed** or **Holds an equivalent** needs the date (completed on / achieved on) **and an uploaded certificate**; **Not required** needs a note. Enforced in the UI and `PUT /api/diploma`.
- Certificates live in the **private** Storage bucket `qualification-certificates` (`<schema>/<profileId>/<qualification>/…`, PDF/images, 10 MB). `/api/qualification-certificates`: POST → one-time signed upload URL (browser uploads direct; Vercel caps bodies ~4.5 MB), PATCH → records it on `staff_qualifications` (replaces and deletes the old file), GET → 2-minute signed link. Access via `canManagePerson` (`src/lib/qualificationAccess.ts`): admins all; others only people at their homes (children's homes for Level 3). Client helper `src/lib/certificateUpload.ts`.
- `staff_qualifications` + `achieved_on`, `certificate_path`, `certificate_name`, `extended_to`, `extension_reason` (extensions used by the Care Certificate next). Migration `20261118210000_qualification_evidence.sql`.
- **Care Certificate never expires** on every matrix (`20261118200000_care_certificate_never_expires.sql`: same as the header's "Never expires": never_expires, expiry_months 9999, expiry dates cleared). Matrix history label `qualification_tracker` added for tracker writes.

### Level 3 Diploma moved into the NVQ & Diploma Tracker (2026-11-18)
- The tracker is now the **"🎓 Level 3 Diploma – children's homes"** tab on `/apps/nvq-diploma` (component `src/app/components/Level3DiplomaTracker.tsx`; `?tab=level3`). Its own dashboard tile and the `DIPLOMA_TRACKER` permission were removed; `/reports/diploma` redirects to the tab. Access is unchanged and matches the enquiries tab: admins see every home, managers/schedulers only the homes assigned to or managed by them (`getScopedLocations`). Qualifications on entry will come from another system later (free-text field for now).

### Staff start date + qualifications on entry (2026-11-18)
- `profiles.start_date` and `profiles.qualifications_on_entry` — one start date per person drives every "within X of starting" rule (Level 3 Diploma 2 years at children's homes; Care Certificate 12 weeks, next). Entered in Add/Edit Staff (`AddStaffModal`, `/api/add-staff`), the trackers (saved to the profile) and, later, a spreadsheet upload. Level 3 tracker now reads the profile date (falls back to `staff_qualifications.start_date`).
- `staff_qualifications.qualification` also allows `CARE_CERTIFICATE` (for "already holds an equivalent" / "not required"; completion comes from the Training Matrix).
- Migration `20261118190000_staff_start_date.sql` (copies dates already typed into the Level 3 tracker).

### Level 3 Diploma tracker – part 2: tracker page (2026-11-18)
- `/reports/diploma` (dashboard tile "Level 3 Diploma"; `DIPLOMA_TRACKER` permission: admin, scheduler, manager; managers see their own homes). Headline tiles (qualified %, overdue, due within 6 months, start date needed), filters (home, where they stand, name), one table per children's home with an inline edit panel (start date, status, provider, enrolled/completed dates, equivalent, notes; shows the resulting band before saving), Excel download.
- `GET|PUT /api/diploma` — people per home come from `staff_locations` (same as the compliance report); saving checks the person is at a children's home in the caller's scope. Server assembly in `src/lib/diplomaTracker.ts`.

### Level 3 Diploma tracker – part 1: data and rules (2026-11-18)
- Scope: **Level 3 Diploma in Residential Childcare** at Ofsted **children's homes** (Reg 32: within 2 years of starting). Schools and CQC homes are excluded; Level 5 (registered managers) later — the table already allows it.
- `locations.diploma_required` — "Children's home – Level 3 Diploma required" tick box in Manage Venues (only shown for Ofsted). Pre-ticked once by the migration for Ofsted sites whose name has no "school".
- `staff_qualifications` (one row per person per qualification; `start_date` = start of the 2-year clock; status not_started/enrolled/in_progress/completed/equivalent/not_required; enrolled_on, provider, completed_on, equivalent, notes). Server-only.
- Rules in **`src/lib/diploma.ts`**: due = start + 2 years; bands overdue / start date needed / due within 6 months / not enrolled yet (3 months after start, an internal nudge) / on track / qualified / not required; `diplomaSummary` for homes.
- Migration `20261118170000_level3_diploma_tracker.sql` (public + dev). Next: part 2 tracker page + CSV upload, part 3 compliance report.

### Feedback forms – Phase 4, part 4: admin screen (2026-11-18)
- `/automation-control` is now the **Feedback & Emails** page (admin card renamed; replaces `FeedbackManagerModal`, removed). Tabs: **Questions** (edit/reorder/add/remove, answer types, 1/10 meanings, options, min picks, positive words; live preview using `FeedbackQuestionFields`; "Standard questions" reset), **Emails** (feedback email and booking reminders, each with its own switch, timings and texts; confirm before switching on), **Send now** (sessions of the last 14 days with signed-in counts; test mode on by default, to the logged-in admin; live send needs confirmation).
- `GET|PUT /api/feedback/settings` (admin): saves questions to `feedback_settings.default_form` (cleaned with `normaliseQuestions`), email settings to `feedback_automation_settings` (old texts' literal `\n` shown as line breaks). Email sends also fixed: bookings→profiles embed named (`profiles:profile_id`) — the unnamed one was ambiguous and every send returned 500.

### Feedback forms – Phase 4, part 3: emails (2026-11-18)
- `/api/automations/feedback-emails` (cron every 10 min via `cron.yml`, or admin): **two switches** on `feedback_automation_settings`: `is_enabled` = feedback email only (to people signed in on the register, link `/feedback?event=<id>`), new `reminders_enabled` = booking reminders (staff N days before + list to each home's manager Google Group from `locations.manager_email`; homes without one are skipped; the guessed `{home}managers@` addresses are no longer used). Both OFF.
- Emails are due from their target time for up to 12 h (was a ±5 min window that a late GitHub run would miss). Test-mode sends go to one address, send one sample of each kind and do **not** mark the session as sent (they used to, which would have blocked the real email). Sending for one session (`POST { eventId }`) always needs an admin.
- Removed the unused `/api/schedule-feedback-emails` (wrong time zone). `isTestSend()` added to `src/lib/email.ts`. Migration `20261118150000_feedback_reminders_switch.sql`.

### Feedback forms – Phase 4, part 2: results (2026-11-18)
- `/feedback/results` rebuilt: reads/deletes via **`GET|DELETE /api/feedback/results`** (admin only; was the browser client, and delete silently failed because there was no DELETE policy). Filters: period (by session date) + course. Each current question is summarised automatically (`summariseQuestion` in `src/lib/feedbackForm.ts`: before→after averages, 1–10 average, option/word counts with positive/negative colours, comments). Anonymous responses show as "Anonymous". Response rate = feedback_submissions ÷ bookings signed in (`attended_at`), per course and overall. Excel: Responses + Response rates sheets. Deleting a named response also clears its `feedback_submissions` row so the person can answer again. Older rows are read via `answersFromRow` (original columns).
- `/feedback` without a link: admins/schedulers get recent sessions (last 60 days) with Open form / Copy link; "📝 Open the form" on Feedback Results.

### Feedback forms – Phase 4, part 1: the form (2026-11-18)
- Staff can now open `/feedback` (proxy allowed list); before, they were redirected to the booking calendar. Logged-out visitors are sent to `/login?next=…` and returned to the link after signing in (`src/proxy.ts`, `src/app/login/page.tsx`; only same-site paths).
- One form for every course. Questions come from `feedback_settings` key `default_form` (`config.fields`, what the builder edits) via `normaliseQuestions` in **`src/lib/feedbackForm.ts`** (also reads the older builder types; falls back to `DEFAULT_QUESTIONS`). Types: before_after, scale (1–10 buttons), choice, words, text. `feedback_form_config` is no longer used.
- `GET|POST /api/feedback` (any logged-in role): course/date from the session, never the link; validation shared with the page (`validateAnswers`). Name optional: anonymous responses store no name or id. `feedback_submissions` (event, person; unique; server-only) records who has responded, unlinked from the answers, so nobody answers twice. Answers in `course_feedback.responses`; standard answers are also copied to the old columns.
- Shared question renderer `src/app/components/FeedbackQuestionFields.tsx` (for the admin preview later).
- Migration `20261118120000_feedback_form_v2.sql`: `is_anonymous`, `respondent_id`, old NOT NULLs dropped, `feedback_submissions`, and **security**: `course_feedback` was readable by any logged-in user (`USING true`) → admins only; browser inserts removed.

### Compliance check snapshots (2026-11-18)
- Snapshots are now taken **per home by the compliance team** (admins + schedulers, homes in their scope) with "📸 Take snapshot" on a home's report page, plus an optional note. Every snapshot is kept (several a month is fine), with who took it (`taken_by`, `taken_by_name`) and `note`.
- A home's page shows **Since the last check** (then vs now vs change for compliance, expired, never completed, expiring, allocated, Oliver McGowan), a **Compliance at each check** chart and a **Check history** table (change from the previous check). The overview's "▲/▼ since last check" uses each home's latest snapshot. Excel Summary lists the checks.
- The automatic monthly snapshot (`.github/workflows/monthly-compliance-snapshot.yml`) and the overview's "Save this month's snapshot" button were **removed** at the user's request. `saveSnapshots` → `saveCheckSnapshot` in `src/lib/complianceReport.ts`.
- Migration: `supabase/migrations/20261118090000_compliance_snapshots_per_check.sql` (run after `20261117180000_…`; drops the one-per-month unique rule, adds the columns and an index; public + dev).

### Compliance report – Phase 3 (2026-11-17)
- `/reports/compliance` (dashboard tile "Compliance Report"; `COMPLIANCE_REPORT` permission: admin, scheduler, manager; managers see their own homes). Overview of every home (lowest compliance first, CQC/Ofsted filter, change since last snapshot) → click a home for: headline tiles, Oliver McGowan (learning disability & autism) %, hours delivered/lost for the chosen period, monthly trend, by-course and by-person tables with "Booked" dates. **Download PDF** = print view (forces light theme, adds generated-by/date header); **Download Excel** = 3 tabs via `write-excel-file` (browser build, loaded on demand).
- Compliance % = in date (incl. expiring) ÷ cells that apply; N/A and Not yet due excluded. Cell rules live in **`src/lib/compliance.ts` (`evaluateHomes`)**, shared by the report, snapshots and the manager email (`managerDigest.ts` now builds on it). Report assembly: `src/lib/complianceReport.ts`. Hours per home match people by `profiles.location` (as the Intelligence Hub does).
- Monthly snapshots: `compliance_snapshots` (one row per home per month, re-saving replaces). Saved 06:00 UTC on the 1st by `.github/workflows/monthly-compliance-snapshot.yml` (no emails) or by admins ("Save this month's snapshot"). Routes: `GET /api/reports/compliance`, `GET|POST /api/reports/compliance/snapshot`. Migration: `20261117180000_add_compliance_snapshots.sql`.

### Training matrix history – Phase 2 (2026-11-17)
- A trigger on `staff_training_matrix` (public + dev) writes every change to completion date, expiry, status, course or home into `staff_training_matrix_history` (who, when, old → new, source). Identical rewrites aren't logged; history is append-only (no write policies).
- Source: browser edits = `manual` + signed-in user. Server routes pass `createServiceClient({ source, userId })` (`src/lib/apiAuth.ts`), which sends `x-change-source` / `x-changed-by` headers; the trigger trusts them only for service-key requests. Sources: new_starter, bulk_edit, csv_import, atlas_import, atlas_sync, restored, removed_from_home, course_removed; anything else = `system`. **Any new code that writes to the matrix from the server should pass a change tag.**
- UI: "🕘 History" in the matrix cell edit box (`MatrixCellHistory.tsx`), last 20 entries, each with **From** / **To** values. Admins and schedulers get "↩ Change back" on updated/removed entries, which restores the old status, completion and expiry dates via `POST /api/training-matrix/history/restore` (location-scoped; re-adds a removed record). The change back is itself logged with source `history_restore`. Migrations: `20261117150000_add_training_matrix_history.sql` + fix `20261117160000_fix_training_matrix_history_id_types.sql` (matrix ids are bigint; history stores all ids as text).

### Compliance report groundwork – Phase 1 (2026-11-17)
- `locations.regulator` ('CQC' / 'Ofsted', optional) set in Admin → Manage Venues.
- Training hours are worked out from booked sessions, not stored: session hours = end time − start time (no lunch deduction). Attended = session − minutes late; lost = whole session for absences + minutes late. Shown on the Intelligence Hub. Helper: `src/lib/trainingHours.ts`.
- Migration: `supabase/migrations/20261117120000_add_location_regulator.sql` (public + dev). Next: Phase 2 matrix history, Phase 3 compliance report.

### Monthly manager training email (2026-11-17)
- **Status: the automatic monthly send is PAUSED** until the portal goes fully live (schedule commented out in `.github/workflows/monthly-manager-digest.yml`). Previews still work. To switch on, uncomment the `schedule` lines.
- When switched on: on the 1st of each month at 07:00 UTC, each home gets one email listing, grouped by person: **expired**, **never completed**, **expiring in the next 60 days**, and **allocated but not completed**. A green "Booked <date>" tag shows when the person is already on an upcoming session for that course (matched by course name).
- Recipient is `locations.manager_email` (the home's managers' Google Group, set in Admin → Manage Venues). If it's empty, the email goes to the training inbox with a note to add it. **Each Google Group must allow posts from the training inbox address.**
- Each person linked to the home is checked against each course on the home's matrix, using the same rules as the matrix cell colours in `MatrixLayout.tsx`: N/A and Not yet due are left out; Allocated wins; no completion date = never completed (the matrix's red "Missing"); completed with no expiry date, or expiring today or earlier = expired. "X" and "X (Careskills)" are one course (latest expiry wins), and the expiry rule (one-off or not) comes from the course on the home's matrix, not the copy the record was saved under.
- `manager_digest_log` (unique per home + month) stops repeat sends. Test mode sends are not logged.
- Code: `src/lib/managerDigest.ts` (data + email layout), `src/app/api/automations/manager-digest/route.ts`, `ManagerDigestModal.tsx`, Location Manager field. Migration: `supabase/migrations/20261117090000_add_location_manager_email_and_digest_log.sql` (public + dev).

### Password reset journey (2026-11-16)
- Previously the emailed "Reset Your Password" link was an implicit-flow magic link that the PKCE browser client and `/auth/callback` couldn't handle, so it ended on a 404 and never showed a password form.
- New: formal email template ("Reset your Cascade Portal password" / "Set up your Cascade Portal account"), `/auth/confirm`, `/auth/set-password`, `/auth/forgot-password`, `/api/auth/forgot-password`, and a "Forgotten your password?" link on `/login`. Sender is unchanged (Training Team, training inbox).
- 7 new Playwright tests in `tests/e2e/smoke.spec.ts`.

### Security hardening (2026-11-16)

1. **Database RLS lockdown** – Removed always-true policies that let the public (anon) key read and edit `courses` and `location_courses`, and read `training_courses`, `location_training_courses` and `staff_training_locations`, without logging in. `course_feedback` inserts now need a login; `sheet_sync_configs` is admin-only; `handle_new_user()` is no longer callable directly. Applied to both `public` and `dev`. Migrations: `supabase/migrations/20261116120000_*` and `20261116130000_*`. Rollback: `migrations/rollback-20261116-tighten-open-rls.sql`.
2. **RLS health check** – `migrations/verify-rls-lockdown.sql`. Expected result: only the `current_user_role_tier` / `current_user_location_ids` helper functions.
3. **API auth** – `/api/matrix-headers` now requires a session (it was missed by the 2026-11-03 audit because it lives in the Pages Router). Cron secrets are compared in constant time.
4. **Headers** – Added HSTS, Cross-Origin-Opener-Policy and an enforced Content-Security-Policy (`buildContentSecurityPolicy()` in `next.config.ts`). The app loads no third-party resources; add an origin there if a new feature needs one.
9. **Performance** – React Compiler enabled (`reactCompiler: true`) for automatic memoisation; dependencies updated in range (React 19.3, Tailwind 4.3).
10. **Tests** – `tests/e2e/smoke.spec.ts` now checks security headers, CSP violations on `/login`, `/api/matrix-headers` auth and cron secret rejection (17 tests).
5. **Dependencies** – nodemailer 10.6 (address-parser advisories), Next.js 16.4.6, supabase-js 2.119.
6. **Build** – `npm run build` now uses Turbopack (~2× faster). `npm run build:webpack` is kept as a fallback.
7. **Feedback email links** – Fallback base URL changed from the retired `training-portal.vercel.app` to `cascade-training.vercel.app`. Set `NEXT_PUBLIC_APP_URL` in Vercel as well.
8. **Docs** – Old one-off reports moved to `docs/archive/`.

### Recent changes (2026-11-12)

1. **Sticky collapsible location headers in BookingModal** – Both the Add Staff tab and the Roster tab now group staff by location under collapsible headers that stick to the top of the scroll area (`sticky top-0 z-10`). The Roster tab previously showed a flat sorted list; it now uses the same grouped pattern as the Add Staff tab. Each tab has independent expand/collapse state.
2. **Session timeout warning modal** – `SessionTimeout.tsx` now shows a countdown warning modal 60 seconds before auto-logout. Users can click "Stay Logged In" to reset the inactivity timer or "Log Out Now" to sign out immediately. Previously the logout happened silently.

### Previous fixes (2026-11-12)

1. **Email system refactor** – Full audit and fix of all email-sending routes:
   - `schedule-feedback-emails`: Fixed `profiles(email, name)` → `profiles(email, full_name)` so staff names appear correctly instead of always falling back to "Staff Member". Added `escapeHtml` to template values before HTML insertion.
   - `send-course-notification`: Removed duplicate `escapeHtml` function, now imports from `email.ts`. Times now display in 12-hour format (e.g. "2:30 PM") via `formatTime()`. Added proper `TrainingEventWithCourse` type.
   - `add-staff`: `sendPasswordResetEmail()` now receives `emailOptions` so test mode headers are respected for staff invite emails.
   - `send-booking-cancellation`: Added step-by-step logging matching the confirmation route pattern.
   - `BookingModal`: Event cancellation emails now send in parallel via `Promise.allSettled()` instead of a serial loop.
   - `email.ts`: Exported `escapeHtml()` and `formatTime()` for reuse across routes.
   - `automations/feedback-emails`: Deduplicated local `escapeHtml`, now imports from `email.ts`.

### Previous fixes (2026-11-05)

1. **Atlas Excel import schema bug** – The import route created its own raw Supabase client defaulting to the `public` schema, causing dev/preview deployments to read/write the wrong schema. Switched to the schema-aware `authz.service` client used by every other route. Also removed ~30 verbose `console.log` statements left from development and deleted the unused `AtlasImportModal` component.

### Previous fixes (2026-11-03)

1. **Sign In App webhook** – Fixed ambiguous booking handling. When a staff member has multiple bookings on the same day, the webhook now marks all of them as attended instead of rejecting the sign-in.
2. **Feedback email duplication** – The cron automation now marks the event as sent when at least one email succeeds, preventing re-sending to all staff on the next run.
3. **Staff matrix initialization** – Added automatic retry on failure and surfaced warnings to admins so they know when to manually add training courses.
4. **Profile email desync** – Profile table is now updated before Supabase Auth with rollback on auth failure, keeping the two in sync.
5. **SMTP error leak** – Email send errors now return a generic message instead of raw nodemailer output that could expose server details.

### Auth audit (2026-11-03)

All 51 API routes audited. 47 use `requireRole()`, 2 use webhook/cron auth, 2 are intentionally public (`/api/version`, `/api/auth/sign-out`). Location scoping is applied on all routes that access location-specific data. No unprotected routes found.

## 12. Common Development Tasks

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

## 13. Project Root Config Files

| File | Purpose |
|---|---|
| `.agentignore` | Blocks AI agents from scanning `node_modules/`, `.next/`, `dist/`, secrets, logs, and media files |
| `PROJECT_SUMMARY.md` | This file – must be kept current after every feature addition |
| `src/proxy.ts` | Supabase session guard for pages (skips `/api/*`) |
| `next.config.ts` | Next.js config and security headers |
| `postcss.config.mjs` | Tailwind CSS v4 (configured via CSS, no `tailwind.config.ts`) |
| `docs/archive/` | Historical one-off reports, kept for reference |
| `tsconfig.json` | TypeScript compiler options |

---

*Last updated: 2026-11-18*
