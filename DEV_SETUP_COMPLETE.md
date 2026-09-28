# Dev Environment Setup - Quick Start ⚡

Your dev branch is live and ready! Here's what you need to do to complete the setup:

## 1️⃣ Create Dev Schema Tables (2 minutes)

1. Go to **https://app.supabase.com**
2. Select your project → **SQL Editor** → **New Query**
3. Copy this entire block and run it:

```sql
-- Create dev schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS dev;

-- Copy all tables from public to dev schema
CREATE TABLE IF NOT EXISTS dev.booking_checklist_template_items AS TABLE public.booking_checklist_template_items WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.booking_checklists AS TABLE public.booking_checklists WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.bookings AS TABLE public.bookings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.courses AS TABLE public.courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.profiles AS TABLE public.profiles WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.training_events AS TABLE public.training_events WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.checklist_completions AS TABLE public.checklist_completions WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.course_event_overrides AS TABLE public.course_event_overrides WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.course_feedback AS TABLE public.course_feedback WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.deleted_items AS TABLE public.deleted_items WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.email_logs AS TABLE public.email_logs WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_automation_settings AS TABLE public.feedback_automation_settings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_email_logs AS TABLE public.feedback_email_logs WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_form_config AS TABLE public.feedback_form_config WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_settings AS TABLE public.feedback_settings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_courses AS TABLE public.location_courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_matrix_dividers AS TABLE public.location_matrix_dividers WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_training_courses AS TABLE public.location_training_courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.locations AS TABLE public.locations WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.qualification_lead_timeline AS TABLE public.qualification_lead_timeline WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.qualification_leads AS TABLE public.qualification_leads WITH NO DATA;
```

## 2️⃣ Copy RLS Policies (1 minute)

The migration file `migrations/copy-policies-to-dev.sql` contains all 76+ RLS policies already converted for the dev schema.

1. Go back to **SQL Editor** → **New Query**
2. Download or view the file: [`migrations/copy-policies-to-dev.sql`](../migrations/copy-policies-to-dev.sql)
3. Copy the entire file and run it in Supabase

This ensures the dev schema has the same security/permissions as production.

## 3️⃣ Verify Setup

1. Go to Vercel → Your Project → Deployments
2. Find the `dev` branch deployment
3. Click the URL (should be `training-portal-dev.vercel.app` or similar)
4. Test logging in and accessing different features
5. Check that you now have proper permissions!

## URLs

- **Production (main)**: `training-portal.vercel.app` (queries `public` schema)
- **Development (dev)**: `training-portal-dev.vercel.app` (queries `dev` schema)

## What's Different

| Aspect | Production | Dev |
|--------|------------|-----|
| URL | `training-portal.vercel.app` | `training-portal-dev.vercel.app` |
| Schema | `public` | `dev` |
| Data | Production data | Separate/test data |
| Environment | Stable | For testing changes |

## Status

✅ Code updated to support dev/production schema switching
✅ Dev branch created and pushed to GitHub
✅ Vercel automatically deploying dev branch
⏳ **You need to**: Run the SQL migrations in Supabase

## Troubleshooting

**Can't see dev URL in Vercel?** → Wait 2-3 minutes for Vercel to finish deployment

**Getting permission errors after setup?** → Make sure both SQL scripts ran without errors

**Tables exist but data is missing?** → This is normal! Dev starts empty.

---

Ready to go! 🚀
