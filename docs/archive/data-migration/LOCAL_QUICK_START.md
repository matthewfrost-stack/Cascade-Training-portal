# Local Development - Quick Commands

## Environment Status ✅
- Node.js: v24.11.1 ✓
- npm: 11.6.2 ✓
- .env.local: Exists ✓

## Start the application

```bash
cd /Users/matthewfrost/training-portal
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Verification commands

```bash
npx tsc --noEmit
npm run build
npm run test:routes
```

## Current feature smoke checks

After signing in, verify:

- Booking Calendar event cards show the course venue.
- Open an event, switch to **Roster**, and confirm admin/scheduler users see **Settings**.
- Set a booking limit and roster message, save, refresh, and confirm both remain.
- Open **Admin → Checklist Template**, remove an item, and confirm it no longer appears in future booking checklists.

## Optional data checks

```bash
# Only run data migration scripts when specifically required by the task.
# Inspect the script and its target data before running it.
```
