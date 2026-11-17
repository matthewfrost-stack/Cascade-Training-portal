-- Groundwork for the compliance report (CQC / Ofsted).
--
-- locations.regulator: who inspects the home, 'CQC' or 'Ofsted'.
-- Optional. Set by admins in Admin -> Manage Venues. The report uses it to
-- show the right sections (e.g. Level 3 Diploma for Ofsted homes). The
-- existing admin-only write policies on locations already cover it.
--
-- Training hours are NOT stored: they are worked out from each booked
-- session's start and end times. An earlier draft of this file added
-- training_courses.hours; the DROP below removes it if it was run.
--
-- Safe to run more than once. Applied to both the live (public) and dev schemas.
--
-- ROLLBACK (only if something breaks):
--   ALTER TABLE public.locations DROP COLUMN IF EXISTS regulator;
--   ALTER TABLE dev.locations DROP COLUMN IF EXISTS regulator;

ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS regulator text
  CHECK (regulator IS NULL OR regulator IN ('CQC', 'Ofsted'));
ALTER TABLE dev.locations ADD COLUMN IF NOT EXISTS regulator text
  CHECK (regulator IS NULL OR regulator IN ('CQC', 'Ofsted'));

ALTER TABLE public.training_courses DROP COLUMN IF EXISTS hours;
ALTER TABLE dev.training_courses DROP COLUMN IF EXISTS hours;

NOTIFY pgrst, 'reload schema';
