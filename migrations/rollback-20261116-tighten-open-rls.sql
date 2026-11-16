-- ROLLBACK for supabase/migrations/20261116120000_tighten_open_rls_policies.sql
--
-- Only run this if the app misbehaves after the security migration.
-- It restores the previous (OPEN) policies exactly as they were, which
-- re-opens the security holes — treat it as a temporary emergency measure.
--
-- Kept outside supabase/migrations/ on purpose so it is never auto-applied.
-- Set the schema list to match where you applied the migration.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['dev'] LOOP   -- add 'public' if rolling back live

    -- Remove policies the migration added
    EXECUTE format('DROP POLICY IF EXISTS "App scheduler insert courses" ON %I.courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "App scheduler insert location_courses" ON %I.location_courses', s);

    -- courses
    EXECUTE format('DROP POLICY IF EXISTS "courses_select" ON %I.courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "courses_insert" ON %I.courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "courses_update" ON %I.courses', s);
    EXECUTE format('CREATE POLICY "courses_select" ON %I.courses FOR SELECT USING (true)', s);
    EXECUTE format('CREATE POLICY "courses_insert" ON %I.courses FOR INSERT WITH CHECK (true)', s);
    EXECUTE format('CREATE POLICY "courses_update" ON %I.courses FOR UPDATE USING (true)', s);

    -- location_courses
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_select" ON %I.location_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_insert" ON %I.location_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "location_courses_update" ON %I.location_courses', s);
    EXECUTE format('CREATE POLICY "location_courses_select" ON %I.location_courses FOR SELECT USING (true)', s);
    EXECUTE format('CREATE POLICY "location_courses_insert" ON %I.location_courses FOR INSERT WITH CHECK (true)', s);
    EXECUTE format('CREATE POLICY "location_courses_update" ON %I.location_courses FOR UPDATE USING (true)', s);

    -- course catalogues
    EXECUTE format('DROP POLICY IF EXISTS "Enable read for all users" ON %I.training_courses', s);
    EXECUTE format('DROP POLICY IF EXISTS "Enable read for all users" ON %I.location_training_courses', s);
    EXECUTE format('CREATE POLICY "Enable read for all users" ON %I.training_courses FOR SELECT USING (true)', s);
    EXECUTE format('CREATE POLICY "Enable read for all users" ON %I.location_training_courses FOR SELECT USING (true)', s);

    -- staff_training_locations
    EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated to read staff_training_locations" ON %I.staff_training_locations', s);
    EXECUTE format('CREATE POLICY "Allow authenticated to read staff_training_locations" ON %I.staff_training_locations FOR SELECT USING (true)', s);

    -- course_feedback
    EXECUTE format('DROP POLICY IF EXISTS "Allow public inserts" ON %I.course_feedback', s);
    EXECUTE format('CREATE POLICY "Allow public inserts" ON %I.course_feedback FOR INSERT TO authenticated, anon WITH CHECK (true)', s);

  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
