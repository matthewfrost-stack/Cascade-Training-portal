# Cascade Portal

Cascade Portal is an internal Next.js training-compliance application backed by Supabase. It provides training-matrix tracking, expiry checking, course scheduling, staff booking, attendance, checklists, analytics, and administration tools.

## Run locally

```bash
cd /Users/matthewfrost/training-portal
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development server uses `.env.local` for Supabase configuration.

Useful verification commands:

```bash
npx tsc --noEmit
npm run build
npm run test:routes
```

## Main areas

| Area | Route | Purpose |
|---|---|---|
| Dashboard | `/dashboard` | Entry point for the training tools |
| Training Matrix | `/training-matrix` | Staff, course, location, and compliance records |
| Booking Calendar | `/apps/booking-calendar` | Schedule sessions and manage rosters |
| Course Expiry Checker | `/apps/expiry-checker` | Review expiring and expired training |
| Training Course Checker | `/apps/training-course-checker` | Organisation-wide training-needs view |
| Admin | `/admin` | Locations, course catalogue, checklist template, and automation controls |

## Current booking and roster features

- Calendar event cards show the course, training venue, time, and booking count.
- Booking rosters support staff booking, attendance, absence, lateness, removal, and CSV export.
- Admins and schedulers can open roster **Settings** to set a date-specific booking limit and a message shown at the top of the roster.
- Booking limits reuse the existing `course_event_overrides` data and are enforced by the booking API and database trigger; date-specific limits are managed from the roster rather than the course catalogue.
- Event messages reuse `training_events.notes`.
- The admin checklist template supports adding, editing, activating/deactivating, reordering, invoice-input configuration, and removing items.

## Roles

Roles are stored on `profiles.role_tier` and checked through `src/lib/permissions.ts`:

- `staff`: view permitted training and rosters.
- `manager`: view permitted training and rosters, with location-scoped access.
- `scheduler`: create/manage sessions and bookings, edit rosters and roster settings.
- `admin`: full administration access.

## Project reference

See [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) for the current architecture, key components, data flow, permissions, and development hand-off notes. Historical migration reports are kept under [`scripts/data-migration/`](./scripts/data-migration/) and should be read as dated records rather than current specifications.
