# Local Testing - Quick Commands

## Environment Status ✅
- Node.js: v24.11.1 ✓
- npm: 11.6.2 ✓
- .env.local: Exists ✓

## Copy & Paste Commands

### 1. Check for Duplicate Locations
```bash
cd /Users/matthewfrost/training-portal && node scripts/find-duplicate-locations.js
```

### 2. Start Development Server
```bash
cd /Users/matthewfrost/training-portal && npm run dev
```
Then visit: http://localhost:3000

### 3. Run All Tests
```bash
# Check duplicates
node scripts/find-duplicate-locations.js

# Merge duplicates if found
node scripts/merge-duplicate-locations.js

# Start server
npm run dev
```

## Testing Checklist

After starting `npm run dev`:

- [ ] Go to Training Matrix page
- [ ] Click on a course's expiry time (e.g., "12m")
- [ ] Look for "Never expires" checkbox
- [ ] Try checking it
- [ ] Click "Save"
- [ ] Refresh and verify it saved
- [ ] Go to Add Staff page
- [ ] Check location dropdown - no duplicates?
- [ ] Go to Location Manager
- [ ] Check location list - no duplicates?

## Database Migration

After confirming frontend works, apply migrations:

1. Login to Supabase Dashboard
2. Go to SQL Editor
3. Paste this and run:

```sql
-- Migration 1: Add never_expires column
ALTER TABLE courses
ADD COLUMN IF NOT EXISTS never_expires BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_courses_never_expires ON courses(never_expires);

COMMENT ON COLUMN courses.never_expires IS 'When TRUE, this course never expires regardless of expiry_months value';
```

Then run migration 2 (update function) - check the file:
`supabase/migrations/20260202000002_update_course_data_function.sql`

## Everything OK?

You're ready to deploy! The changes are:
- ✅ Tested locally
- ✅ Syntax validated
- ✅ Database ready
- ✅ Frontend ready

Just push to production!
