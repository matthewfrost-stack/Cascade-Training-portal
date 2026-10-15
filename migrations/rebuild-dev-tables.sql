-- Rebuild every dev table as a full structural copy of its public counterpart.
--
-- Needed when dev tables were first created with `CREATE TABLE ... AS TABLE ... WITH NO DATA`
-- (the original version of create-dev-schema.sql). That copies columns only: no primary keys,
-- defaults or constraints, so foreign keys can't be added and PostgREST embeds fail with PGRST200.
-- `CREATE TABLE IF NOT EXISTS ... LIKE` never repairs them because the tables already exist.
--
-- WARNING: drops all dev tables and their data. Afterwards run, in order:
--   1. fix-dev-schema-permissions.sql  (grants, foreign keys, policies)
--   2. copy-data-to-dev.sql            (data)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'dev' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP TABLE dev.%I CASCADE', r.table_name);
  END LOOP;

  FOR r IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('schema_migrations')
  LOOP
    EXECUTE format('CREATE TABLE dev.%I (LIKE public.%I INCLUDING ALL)', r.table_name, r.table_name);
    EXECUTE format('ALTER TABLE dev.%I ENABLE ROW LEVEL SECURITY', r.table_name);
  END LOOP;
END $$;

-- Should return no rows: every dev table now has a primary key wherever public has one.
SELECT c.relname AS missing_primary_key
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind = 'r'
  AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = c.oid AND contype = 'p')
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint dc
    WHERE dc.conrelid = to_regclass('dev.' || quote_ident(c.relname)) AND dc.contype = 'p'
  );
