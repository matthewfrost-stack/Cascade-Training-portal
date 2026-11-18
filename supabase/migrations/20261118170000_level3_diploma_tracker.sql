-- Level 3 Diploma in Residential Childcare tracker (Ofsted children's homes).
--
-- 1. locations.diploma_required: "Children's home – Level 3 Diploma required",
--    set in Admin -> Manage Venues. When first added it is ticked for Ofsted
--    sites whose name does not contain "school" (schools are not children's
--    homes); admins then check it. Re-running this file never changes it again.
--
-- 2. staff_qualifications: one row per person per qualification, linked to their
--    profile. `start_date` is when their 2-year clock starts (start in role).
--    `qualification` allows a Level 5 (registered managers) to be added later.
--    Server-only: no browser access (the API applies location access).
--
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
--
-- ROLLBACK (only if something breaks; this deletes the diploma records):
--   DROP TABLE IF EXISTS public.staff_qualifications; DROP TABLE IF EXISTS dev.staff_qualifications;
--   ALTER TABLE public.locations DROP COLUMN IF EXISTS diploma_required;
--   ALTER TABLE dev.locations    DROP COLUMN IF EXISTS diploma_required;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = s AND table_name = 'locations' AND column_name = 'diploma_required'
    ) THEN
      EXECUTE format('ALTER TABLE %I.locations ADD COLUMN diploma_required boolean NOT NULL DEFAULT false', s);
      -- First time only: pre-tick Ofsted sites that aren't schools.
      EXECUTE format($f$UPDATE %I.locations SET diploma_required = true
                        WHERE regulator = 'Ofsted' AND name NOT ILIKE '%%school%%'$f$, s);
    END IF;

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.staff_qualifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_id uuid NOT NULL REFERENCES %I.profiles(id) ON DELETE CASCADE,
        qualification text NOT NULL DEFAULT 'L3_RESIDENTIAL_CHILDCARE'
          CHECK (qualification IN ('L3_RESIDENTIAL_CHILDCARE', 'L5_LEADERSHIP_RESIDENTIAL_CHILDCARE')),
        start_date date,
        status text NOT NULL DEFAULT 'not_started'
          CHECK (status IN ('not_started', 'enrolled', 'in_progress', 'completed', 'equivalent', 'not_required')),
        enrolled_on date,
        provider text,
        completed_on date,
        equivalent text,
        notes text,
        updated_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (profile_id, qualification)
      )$f$, s, s);
    EXECUTE format('ALTER TABLE %I.staff_qualifications ENABLE ROW LEVEL SECURITY', s);
    EXECUTE format('REVOKE ALL ON %I.staff_qualifications FROM anon, authenticated', s);
    EXECUTE format('GRANT ALL ON %I.staff_qualifications TO service_role', s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
