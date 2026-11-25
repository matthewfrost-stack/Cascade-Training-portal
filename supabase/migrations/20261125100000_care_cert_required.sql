-- Care Certificate: per-home "Care Certificate required" setting.
--
-- Schools don't need the Care Certificate, so the tracker (and the compliance
-- report's Care Certificate counts) only include homes with this ticked.
-- New column defaults to true (every home, as now); the first run sets it to
-- false for any location with "school" in its name. Change it per home in
-- Manage Venues. Nothing is deleted: Care Certificate records for school staff
-- stay saved and reappear if the school is ticked again.
-- Applied to both live (public) and dev. Safe to run more than once.
--
-- ROLLBACK (only if something breaks):
--   ALTER TABLE public.locations DROP COLUMN IF EXISTS care_cert_required;
--   ALTER TABLE dev.locations    DROP COLUMN IF EXISTS care_cert_required;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    IF to_regclass(s || '.locations') IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'locations' AND column_name = 'care_cert_required'
    ) THEN
      EXECUTE format('ALTER TABLE %I.locations ADD COLUMN care_cert_required boolean NOT NULL DEFAULT true', s);
      -- First time only: schools don't need it.
      EXECUTE format($f$UPDATE %I.locations SET care_cert_required = false WHERE name ILIKE '%%school%%'$f$, s);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: every location, with whether it needs the Care Certificate (schools should say false).
SELECT 'public' AS schema, name, care_cert_required FROM public.locations
UNION ALL
SELECT 'dev', name, care_cert_required FROM dev.locations
ORDER BY 1, 2;
