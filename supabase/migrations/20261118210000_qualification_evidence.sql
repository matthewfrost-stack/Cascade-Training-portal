-- Evidence and extensions for the qualification trackers (Level 3 Diploma,
-- Care Certificate).
--
-- staff_qualifications gets:
--   achieved_on       – date an equivalent qualification was achieved
--   certificate_path  – where the uploaded certificate is kept (private store)
--   certificate_name  – its original file name
--   extended_to       – agreed new deadline when someone can't meet the normal one
--   extension_reason  – why
--
-- Certificates go in a PRIVATE storage bucket "qualification-certificates"
-- (PDF / photos, 10 MB max). There are no browser policies on it: files are
-- uploaded and opened only through the app's server, which checks the person
-- is at a home the user can see, and hands out short-lived links.
-- Live and dev share the bucket; files are kept under public/… or dev/….
--
-- Applied to both live (public) and dev. Safe to run more than once.
--
-- ROLLBACK (only if something breaks):
--   ALTER TABLE public.staff_qualifications DROP COLUMN IF EXISTS achieved_on, DROP COLUMN IF EXISTS certificate_path,
--     DROP COLUMN IF EXISTS certificate_name, DROP COLUMN IF EXISTS extended_to, DROP COLUMN IF EXISTS extension_reason;
--   (same for dev.staff_qualifications; the bucket can be emptied and deleted in Storage)

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    IF to_regclass(s || '.staff_qualifications') IS NULL THEN CONTINUE; END IF;
    EXECUTE format($f$
      ALTER TABLE %I.staff_qualifications
        ADD COLUMN IF NOT EXISTS achieved_on date,
        ADD COLUMN IF NOT EXISTS certificate_path text,
        ADD COLUMN IF NOT EXISTS certificate_name text,
        ADD COLUMN IF NOT EXISTS extended_to date,
        ADD COLUMN IF NOT EXISTS extension_reason text$f$, s);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qualification-certificates',
  'qualification-certificates',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET public = false;

NOTIFY pgrst, 'reload schema';
