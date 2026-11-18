-- Feedback form, part 1: one form for every course, name optional.
--
-- * course_feedback gets `is_anonymous` and `respondent_id` (null when anonymous).
--   The original per-question columns (knowledge_before etc.) no longer have to be
--   filled, because questions can now be changed in the builder; answers are kept
--   in `responses` (JSON) and the standard ones are still copied to the old columns.
-- * New `feedback_submissions`: one row per person per session saying they have
--   responded. It is NOT linked to the answers, so anonymous feedback stays
--   anonymous while nobody can answer twice. Server-only (no browser access).
-- * Security: course_feedback could be read by ANY logged-in person (USING true).
--   Now admins only. Browser inserts removed (the server saves responses).
-- * Makes sure the dev schema has the same tables as live.
--
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
-- Existing feedback is kept.
--
-- ROLLBACK (only if something breaks):
--   DROP TABLE IF EXISTS public.feedback_submissions; DROP TABLE IF EXISTS dev.feedback_submissions;
--   ALTER TABLE public.course_feedback DROP COLUMN IF EXISTS is_anonymous, DROP COLUMN IF EXISTS respondent_id;
--   ALTER TABLE dev.course_feedback    DROP COLUMN IF EXISTS is_anonymous, DROP COLUMN IF EXISTS respondent_id;
--   (the old open read policy is deliberately NOT restored)

DO $$
DECLARE
  s text;
  col text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP

    -- Dev copies of the live feedback tables, if dev is missing them.
    IF s = 'dev' AND to_regclass('dev.course_feedback') IS NULL AND to_regclass('public.course_feedback') IS NOT NULL THEN
      CREATE TABLE dev.course_feedback (LIKE public.course_feedback INCLUDING ALL);
      ALTER TABLE dev.course_feedback ENABLE ROW LEVEL SECURITY;
      GRANT ALL ON dev.course_feedback TO service_role;
    END IF;
    IF s = 'dev' AND to_regclass('dev.feedback_settings') IS NULL AND to_regclass('public.feedback_settings') IS NOT NULL THEN
      CREATE TABLE dev.feedback_settings (LIKE public.feedback_settings INCLUDING ALL);
      INSERT INTO dev.feedback_settings SELECT * FROM public.feedback_settings;
      ALTER TABLE dev.feedback_settings ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "App authenticated read feedback_settings" ON dev.feedback_settings
        FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
      CREATE POLICY "App admin write feedback_settings" ON dev.feedback_settings
        FOR ALL TO authenticated USING (public.current_user_role_tier() = 'admin') WITH CHECK (public.current_user_role_tier() = 'admin');
      GRANT SELECT ON dev.feedback_settings TO authenticated;
      GRANT ALL ON dev.feedback_settings TO service_role;
    END IF;

    IF to_regclass(s || '.course_feedback') IS NULL THEN
      RAISE NOTICE 'No %.course_feedback table, skipped', s;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.course_feedback ADD COLUMN IF NOT EXISTS is_anonymous boolean NOT NULL DEFAULT false', s);
    EXECUTE format('ALTER TABLE %I.course_feedback ADD COLUMN IF NOT EXISTS respondent_id uuid', s);
    EXECUTE format('ALTER TABLE %I.course_feedback ADD COLUMN IF NOT EXISTS responses jsonb DEFAULT ''{}''', s);

    -- Questions can change now, so the old per-question columns must allow blanks.
    FOR col IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'course_feedback' AND is_nullable = 'NO'
        AND column_name NOT IN ('id', 'created_at', 'is_anonymous')
        AND column_default IS NULL
    LOOP
      EXECUTE format('ALTER TABLE %I.course_feedback ALTER COLUMN %I DROP NOT NULL', s, col);
    END LOOP;

    EXECUTE format('CREATE INDEX IF NOT EXISTS course_feedback_event_idx ON %I.course_feedback (event_id)', s);

    -- Security: until now ANY logged-in person (staff included) could read every
    -- response, names and all, straight from the browser. Only admins may read now.
    -- Responses are saved by the server (which handles anonymity and duplicates),
    -- so browser inserts are switched off.
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated reads" ON %I.course_feedback', s);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read course feedback" ON %I.course_feedback', s);
    EXECUTE format(
      'CREATE POLICY "Admins read course feedback" ON %I.course_feedback
         FOR SELECT TO authenticated USING (public.current_user_role_tier() = ''admin'')', s);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public inserts" ON %I.course_feedback', s);

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.feedback_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL,
        profile_id uuid NOT NULL,
        submitted_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (event_id, profile_id)
      )$f$, s);
    EXECUTE format('ALTER TABLE %I.feedback_submissions ENABLE ROW LEVEL SECURITY', s);
    EXECUTE format('REVOKE ALL ON %I.feedback_submissions FROM anon, authenticated', s);
    EXECUTE format('GRANT ALL ON %I.feedback_submissions TO service_role', s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
