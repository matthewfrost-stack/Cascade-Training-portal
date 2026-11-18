-- One start date per person, used by every "within X of starting" rule
-- (Level 3 Diploma: 2 years at children's homes; Care Certificate: 12 weeks),
-- plus what they arrived with ("qualifications on entry").
--
-- * profiles.start_date               – when they started (entered in Add/Edit Staff,
--                                       the trackers, or the spreadsheet upload)
-- * profiles.qualifications_on_entry  – free text, e.g. "NVQ 3 Health & Social Care (2015)"
-- * Any start date already typed into the Level 3 tracker is copied across.
-- * staff_qualifications can now also hold CARE_CERTIFICATE records (used for
--   "already holds an equivalent" / "not required"; completion itself comes
--   from the Training Matrix).
--
-- profiles keeps its existing security rules (admins edit; the trackers save
-- through the server). Applied to both live (public) and dev. Safe to run more than once.
--
-- ROLLBACK (only if something breaks; this deletes the start dates):
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS qualifications_on_entry;
--   ALTER TABLE dev.profiles    DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS qualifications_on_entry;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    EXECUTE format('ALTER TABLE %I.profiles ADD COLUMN IF NOT EXISTS start_date date', s);
    EXECUTE format('ALTER TABLE %I.profiles ADD COLUMN IF NOT EXISTS qualifications_on_entry text', s);

    IF to_regclass(s || '.staff_qualifications') IS NOT NULL THEN
      -- Bring across start dates typed into the Level 3 tracker.
      EXECUTE format($f$
        UPDATE %I.profiles p SET start_date = q.start_date
        FROM %I.staff_qualifications q
        WHERE q.profile_id = p.id AND q.start_date IS NOT NULL AND p.start_date IS NULL$f$, s, s);

      EXECUTE format('ALTER TABLE %I.staff_qualifications DROP CONSTRAINT IF EXISTS staff_qualifications_qualification_check', s);
      EXECUTE format($f$ALTER TABLE %I.staff_qualifications ADD CONSTRAINT staff_qualifications_qualification_check
        CHECK (qualification IN ('L3_RESIDENTIAL_CHILDCARE', 'L5_LEADERSHIP_RESIDENTIAL_CHILDCARE', 'CARE_CERTIFICATE'))$f$, s);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
