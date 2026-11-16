-- Tighten RLS policies that let anyone holding the publishable (anon) key
-- read or change data without logging in.
--
-- Postgres combines permissive policies with OR, so a single USING (true)
-- policy cancels out every stricter policy on the same table. The stricter
-- "App ..." policies already exist and stay in place; this migration removes
-- the always-true ones and adds a scheduler/admin write policy where the app
-- relies on schedulers adding courses from the training matrix.
--
-- Applied to both the production (public) and dev schemas.
-- Safe to re-run: every DROP uses IF EXISTS and every CREATE is preceded by a DROP.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP

    -- courses: anyone could insert, update and read every course.
    -- Reads stay covered by "App authenticated read courses";
    -- admin writes by "App admin write courses".
    EXECUTE format('DROP POLICY IF EXISTS "courses_select" ON %I.courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "courses_insert" ON %I.courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "courses_update" ON %I.courses', s);
    -- Schedulers add courses from the training matrix (canEditMatrix).
    EXECUTE format('DROP POLICY IF EXISTS "App scheduler insert courses" ON %I.courses', s);
    EXECUTE format(
      'CREATE POLICY "App scheduler insert courses" ON %I.courses FOR INSERT TO authenticated
         WITH CHECK (%I.current_user_role_tier() = ANY (ARRAY[''scheduler''::text, ''admin''::text]))',
      s, s);

    -- location_courses: same problem, same fix.
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_select" ON %I.location_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_insert" ON %I.location_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_update" ON %I.location_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "App scheduler insert location_courses" ON %I.location_courses', s);
    EXECUTE format(
      'CREATE POLICY "App scheduler insert location_courses" ON %I.location_courses FOR INSERT TO authenticated
         WITH CHECK (%I.current_user_role_tier() = ANY (ARRAY[''scheduler''::text, ''admin''::text]))',
      s, s);

    -- Course catalogues readable without logging in. Logged-in reads remain
    -- via "App authenticated read ..."; server jobs use the service key.
    EXECUTE format('DROP POLICY IF EXISTS "Enable read for all users" ON %I.training_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read for all users" ON %I.location_training_courses', s);

    -- staff_training_locations: named "authenticated" but actually USING (true),
    -- so which staff train where was readable without logging in.
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated to read staff_training_locations" ON %I.staff_training_locations', s);
    EXECUTE format(
      'CREATE POLICY "Allow authenticated to read staff_training_locations" ON %I.staff_training_locations
         FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      s);

    -- course_feedback: the feedback page sits behind login, so anonymous
    -- inserts are not needed and only allow spam/junk submissions.
    EXECUTE format('DROP POLICY IF EXISTS "Allow public inserts" ON %I.course_feedback', s);
    EXECUTE format(
      'CREATE POLICY "Allow public inserts" ON %I.course_feedback
         FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)',
      s);

  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
