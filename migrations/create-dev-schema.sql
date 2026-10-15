-- Create dev schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS dev;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'dev'
      AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE dev.user_role AS ENUM ('staff', 'manager', 'scheduler', 'admin');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION dev.current_user_role_tier()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = dev, public
AS $$
  SELECT p.role_tier::text
  FROM dev.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION dev.current_user_location_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = dev, public
AS $$
  SELECT sl.location_id
  FROM dev.staff_locations sl
  WHERE sl.staff_id = auth.uid()
  UNION
  SELECT l.id
  FROM dev.locations l
  JOIN dev.profiles p ON p.id = auth.uid()
  WHERE l.name = p.location
     OR l.name IN (
       SELECT trim(value)
       FROM jsonb_array_elements_text(
         CASE
           WHEN jsonb_typeof(to_jsonb(p.managed_houses)) = 'array'
             THEN to_jsonb(p.managed_houses)
           ELSE '[]'::jsonb
         END
       ) AS managed(value)
     );
$$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('schema_migrations')
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS dev.%I (LIKE public.%I INCLUDING ALL);',
      r.table_name,
      r.table_name
    );

    EXECUTE format(
      'ALTER TABLE dev.%I ENABLE ROW LEVEL SECURITY;',
      r.table_name
    );
  END LOOP;
END $$;

-- Make sure the standard tables referenced by the app exist in dev.
CREATE TABLE IF NOT EXISTS dev.staff_locations (LIKE public.staff_locations INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.staff_training_matrix (LIKE public.staff_training_matrix INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.ticket_updates (LIKE public.ticket_updates INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.training_courses (LIKE public.training_courses INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.venues (LIKE public.venues INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.qualification_leads (LIKE public.qualification_leads INCLUDING ALL);
CREATE TABLE IF NOT EXISTS dev.qualification_lead_timeline (LIKE public.qualification_lead_timeline INCLUDING ALL);

ALTER TABLE dev.staff_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.staff_training_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.ticket_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.qualification_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.qualification_lead_timeline ENABLE ROW LEVEL SECURITY;

-- Grant access needed by the app to dev schema functions.
REVOKE ALL ON FUNCTION dev.current_user_role_tier() FROM PUBLIC;
REVOKE ALL ON FUNCTION dev.current_user_location_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dev.current_user_role_tier() TO authenticated;
GRANT EXECUTE ON FUNCTION dev.current_user_location_ids() TO authenticated;
