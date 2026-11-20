-- Level 5 Diploma in Leadership & Management (Registered Managers and Deputies, every home).
--
-- * staff_qualifications can now hold L5_LEADERSHIP records. A row = that person is on
--   the Level 5 list (added from the tracker's "+ Add person"; removing them deletes the row).
-- * New column `role`: 'registered_manager' or 'deputy' (only used by Level 5).
-- * Existing columns are reused: start_date = "in role since", enrolled_on starts the
--   2-year in-house deadline, extended_to / extension_reason for agreed extensions.
--
-- Applied to both live (public) and dev. Safe to run more than once.
--
-- ROLLBACK (only if something breaks; this deletes all Level 5 records):
--   DELETE FROM public.staff_qualifications WHERE qualification = 'L5_LEADERSHIP';
--   DELETE FROM dev.staff_qualifications    WHERE qualification = 'L5_LEADERSHIP';
--   then re-run the CHECK from 20261118190000 and DROP COLUMN role on both.

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    IF to_regclass(s || '.staff_qualifications') IS NULL THEN CONTINUE; END IF;

    EXECUTE format('ALTER TABLE %I.staff_qualifications DROP CONSTRAINT IF EXISTS staff_qualifications_qualification_check', s);
    EXECUTE format($f$ALTER TABLE %I.staff_qualifications ADD CONSTRAINT staff_qualifications_qualification_check
      CHECK (qualification IN ('L3_RESIDENTIAL_CHILDCARE', 'L5_LEADERSHIP_RESIDENTIAL_CHILDCARE', 'CARE_CERTIFICATE', 'L5_LEADERSHIP'))$f$, s);

    EXECUTE format('ALTER TABLE %I.staff_qualifications ADD COLUMN IF NOT EXISTS role text', s);
    EXECUTE format('ALTER TABLE %I.staff_qualifications DROP CONSTRAINT IF EXISTS staff_qualifications_role_check', s);
    EXECUTE format($f$ALTER TABLE %I.staff_qualifications ADD CONSTRAINT staff_qualifications_role_check
      CHECK (role IS NULL OR role IN ('registered_manager', 'deputy'))$f$, s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: both rows should show the role column.
SELECT table_schema, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'staff_qualifications' AND column_name = 'role'
ORDER BY table_schema;
