-- Compliance snapshots become "check snapshots": taken by the compliance team
-- (admins / schedulers) for one home when they do a site check, as often as
-- needed. Each snapshot is kept (no more one-per-month), with who took it and
-- an optional note. The automatic monthly snapshot has been removed.
--
-- Run AFTER 20261117180000_add_compliance_snapshots.sql.
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
-- Existing rows are kept.
--
-- ROLLBACK (only if something breaks):
--   ALTER TABLE public.compliance_snapshots DROP COLUMN IF EXISTS taken_by, DROP COLUMN IF EXISTS taken_by_name, DROP COLUMN IF EXISTS note;
--   ALTER TABLE dev.compliance_snapshots    DROP COLUMN IF EXISTS taken_by, DROP COLUMN IF EXISTS taken_by_name, DROP COLUMN IF EXISTS note;
--   (the one-per-month rule can only be put back if there is at most one row per home per month)

ALTER TABLE public.compliance_snapshots DROP CONSTRAINT IF EXISTS compliance_snapshots_location_id_period_key;
ALTER TABLE dev.compliance_snapshots    DROP CONSTRAINT IF EXISTS compliance_snapshots_location_id_period_key;

ALTER TABLE public.compliance_snapshots
  ADD COLUMN IF NOT EXISTS taken_by uuid,          -- profile id of the person who took it
  ADD COLUMN IF NOT EXISTS taken_by_name text,     -- their name at the time
  ADD COLUMN IF NOT EXISTS note text;              -- optional, e.g. "Quarterly site check"
ALTER TABLE dev.compliance_snapshots
  ADD COLUMN IF NOT EXISTS taken_by uuid,
  ADD COLUMN IF NOT EXISTS taken_by_name text,
  ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS compliance_snapshots_location_taken_idx ON public.compliance_snapshots (location_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS compliance_snapshots_location_taken_idx ON dev.compliance_snapshots (location_id, taken_at DESC);

NOTIFY pgrst, 'reload schema';
