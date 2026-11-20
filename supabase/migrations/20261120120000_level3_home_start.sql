-- Level 3 Diploma: "Started at a children's home" for staff who moved from another site.
--
-- The Level 3 deadline normally runs from the person's company start date
-- (profiles.start_date, shared with the Care Certificate). Someone who worked at a
-- CQC site first only needs Level 3 once they move to a children's home, so this
-- optional date, when filled in, starts the 2-year clock instead.
--
-- Adds one empty column; nothing existing changes. Applied to both live (public) and dev.
-- Safe to run more than once.
--
-- ROLLBACK (only if something breaks; loses the "moved in" dates):
--   ALTER TABLE public.staff_qualifications DROP COLUMN IF EXISTS home_start_date;
--   ALTER TABLE dev.staff_qualifications    DROP COLUMN IF EXISTS home_start_date;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    IF to_regclass(s || '.staff_qualifications') IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I.staff_qualifications ADD COLUMN IF NOT EXISTS home_start_date date', s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: should list two rows, dev and public.
SELECT table_schema, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'staff_qualifications' AND column_name = 'home_start_date'
ORDER BY table_schema;
