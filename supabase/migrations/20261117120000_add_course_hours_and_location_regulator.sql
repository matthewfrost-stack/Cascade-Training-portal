-- Groundwork for the compliance report (CQC / Ofsted).
--
-- 1. training_courses.hours: how long a course takes, in hours (e.g. 6, 1.5).
--    Optional. Set by admins in Admin -> Training Hours. Used to report
--    hours required / completed / outstanding for each home and person.
--
-- 2. locations.regulator: who inspects the home, 'CQC' or 'Ofsted'.
--    Optional. Set by admins in Admin -> Manage Venues. The report uses it
--    to show the right sections (e.g. Level 3 Diploma for Ofsted homes).
--
-- Only adds empty columns; no existing data changes. The existing
-- admin-only write policies on both tables already cover the new columns.
-- Applied to both the live (public) and dev schemas.
--
-- ROLLBACK (only if something breaks):
--   ALTER TABLE public.training_courses DROP COLUMN IF EXISTS hours;
--   ALTER TABLE dev.training_courses DROP COLUMN IF EXISTS hours;
--   ALTER TABLE public.locations DROP COLUMN IF EXISTS regulator;
--   ALTER TABLE dev.locations DROP COLUMN IF EXISTS regulator;

ALTER TABLE public.training_courses ADD COLUMN IF NOT EXISTS hours numeric(6,2)
  CHECK (hours IS NULL OR (hours >= 0 AND hours <= 1000));
ALTER TABLE dev.training_courses ADD COLUMN IF NOT EXISTS hours numeric(6,2)
  CHECK (hours IS NULL OR (hours >= 0 AND hours <= 1000));

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS regulator text
  CHECK (regulator IS NULL OR regulator IN ('CQC', 'Ofsted'));
ALTER TABLE dev.locations ADD COLUMN IF NOT EXISTS regulator text
  CHECK (regulator IS NULL OR regulator IN ('CQC', 'Ofsted'));

NOTIFY pgrst, 'reload schema';
