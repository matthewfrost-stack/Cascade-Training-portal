-- Fix dev schema permissions.
-- Run AFTER create-dev-schema.sql. Safe to re-run.
--
-- Also required (dashboard, not SQL): Project Settings -> Data API -> Exposed schemas
-- must include `dev`, otherwise every API request from the dev deployment is rejected.

-- 1. Grants. Supabase grants these on `public` automatically, but not on new schemas,
--    so without them PostgREST returns "permission denied" before RLS is even checked.
GRANT USAGE ON SCHEMA dev TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA dev TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA dev TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA dev GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- 2. Foreign keys. LIKE ... INCLUDING ALL does not copy them, and the app's embedded
--    selects (e.g. select('*, courses(name)')) need them to resolve relationships.
DO $$
DECLARE
  c RECORD;
  def text;
  t text;
BEGIN
  -- Empty search_path makes pg_get_constraintdef schema-qualify every reference.
  PERFORM set_config('search_path', '', true);

  FOR c IN
    SELECT con.conname, cl.relname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
    WHERE n.nspname = 'public'
      AND con.contype = 'f'
      AND EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'dev' AND table_name = cl.relname
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_constraint dc
        JOIN pg_class dcl ON dcl.oid = dc.conrelid
        JOIN pg_namespace dn ON dn.oid = dcl.relnamespace
        WHERE dn.nspname = 'dev' AND dcl.relname = cl.relname AND dc.conname = con.conname
      )
  LOOP
    def := c.def;
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'dev' LOOP
      def := regexp_replace(def, '\mpublic\.' || t || '\M', 'dev.' || t, 'g');
    END LOOP;

    BEGIN
      EXECUTE format('ALTER TABLE dev.%I ADD CONSTRAINT %I %s', c.relname, c.conname, def);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped FK %.% (%): %', c.relname, c.conname, def, SQLERRM;
    END;
  END LOOP;
END $$;

-- 3. RLS policies. Replace the hand-written subset in copy-policies-to-dev.sql with an exact
--    copy of every production policy, pointing table and helper-function references at `dev`.
--    Types (public.user_role) are deliberately left alone: dev columns still use public.user_role.
DO $$
DECLARE
  p RECORD;
  t text;
  qual text;
  chk text;
  roles text;
  sql text;
BEGIN
  PERFORM set_config('search_path', '', true);

  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'dev' LOOP
    EXECUTE format('DROP POLICY %I ON dev.%I', p.policyname, p.tablename);
  END LOOP;

  FOR p IN
    SELECT *
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'dev')
  LOOP
    qual := p.qual;
    chk := p.with_check;

    FOR t IN
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'dev'
      UNION ALL
      SELECT unnest(ARRAY['current_user_role_tier', 'current_user_location_ids'])
    LOOP
      qual := regexp_replace(qual, '\mpublic\.' || t || '\M', 'dev.' || t, 'g');
      chk := regexp_replace(chk, '\mpublic\.' || t || '\M', 'dev.' || t, 'g');
    END LOOP;

    SELECT CASE WHEN p.roles = '{public}' THEN 'PUBLIC'
                ELSE string_agg(quote_ident(r), ', ') END
    INTO roles
    FROM unnest(p.roles) AS r;

    sql := format('CREATE POLICY %I ON dev.%I AS %s FOR %s TO %s',
                  p.policyname, p.tablename, p.permissive, p.cmd, roles);
    IF qual IS NOT NULL THEN sql := sql || format(' USING (%s)', qual); END IF;
    IF chk IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', chk); END IF;

    BEGIN
      EXECUTE sql;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped policy % on %: %', p.policyname, p.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- 4. Tell PostgREST to pick up the new grants, relationships and policies.
NOTIFY pgrst, 'reload schema';

-- 5. Your login needs a row in dev.profiles with the right role_tier. auth.users is shared
--    between schemas, but profiles are not. Uncomment and set your email to copy yours across:
-- INSERT INTO dev.profiles SELECT * FROM public.profiles WHERE email = 'you@example.com'
-- ON CONFLICT (id) DO NOTHING;
