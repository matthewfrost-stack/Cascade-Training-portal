# Dev Schema Setup - Complete Instructions

## Step 1: Create Tables in Dev Schema

Go to your Supabase dashboard:
1. Navigate to **SQL Editor**
2. Click **New Query**
3. Copy and paste the SQL from [create-dev-schema.sql](create-dev-schema.sql)
4. Click **Run**

This will create all 22+ tables in the `dev` schema.

## Step 2: Copy RLS Policies

After tables are created, run the policies:
1. Go back to **SQL Editor** 
2. Click **New Query**
3. Copy and paste the SQL from [copy-policies-to-dev.sql](copy-policies-to-dev.sql)
4. Click **Run**

This will copy all 76+ RLS policies to the `dev` schema, giving the same permissions/security as production.

## Step 2b: Fix Grants, Foreign Keys and Policies

1. **Project Settings → Data API → Exposed schemas**: add `dev` and save
2. In **SQL Editor**, set your email in the last block of [fix-dev-schema-permissions.sql](fix-dev-schema-permissions.sql), uncomment it, and run the file

Without this, the `dev` schema has no grants for `anon`/`authenticated`, no foreign keys (embedded selects fail), and only a subset of the production policies.

**If pages are blank and the browser shows `PGRST200` ("Could not find a relationship"):** the dev tables were built by the old `CREATE TABLE ... AS TABLE` script and have no primary keys. Run [rebuild-dev-tables.sql](rebuild-dev-tables.sql) (wipes dev data), then re-run this step and Step 2c.

## Step 2c: Copy Data (optional)

The `dev` tables start empty. To fill them with a snapshot of production data, run [copy-data-to-dev.sql](copy-data-to-dev.sql) in the **SQL Editor**. It ends with a table of row counts for `public` and `dev` side by side.

## Step 3: Verify Setup

Once complete, your Vercel dev deployment will automatically:
- ✅ Connect to the `dev` schema (via the code changes we made)
- ✅ Have all the same tables as production
- ✅ Have all the same RLS policies as production
- ✅ Keep data separate from production

## Troubleshooting

**If you see "row violates row level security policy" errors:**
- The policies didn't copy correctly
- Go back to step 2 and verify all policies ran without errors

**If tables exist but are empty:**
- This is normal! The `dev` schema starts empty
- You can add test data, or the sync scripts will populate it
- Production data stays in the `public` schema

**If you still see permission issues:**
- Check that you're logged in as the same user in the dev environment
- Verify the user exists in the `dev.profiles` table
- Check that all policies reference the correct schema (`dev`, not `public`)

## Next Steps

1. Run both SQL files above
2. Test the dev URL in Vercel
3. You should now have full access with proper permissions!
