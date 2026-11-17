-- Monthly "training due" email to each home's managers.
--
-- 1. locations.manager_email: the Google Group address for the managers of
--    that home. Optional. When empty, that home's monthly email goes to the
--    training inbox instead. Edited by admins in Admin -> Manage Venues;
--    the existing "admins write locations" policies already cover it.
--
-- 2. manager_digest_log: one row per home per month once its email is sent,
--    so a re-run or retry never sends the same month twice. Written only by
--    the server (service key, which bypasses RLS); admins can read it.
--
-- Applied to both the live (public) and dev schemas.
--
-- ROLLBACK (only if something breaks):
--   DROP TABLE IF EXISTS public.manager_digest_log;
--   DROP TABLE IF EXISTS dev.manager_digest_log;
--   ALTER TABLE public.locations DROP COLUMN IF EXISTS manager_email;
--   ALTER TABLE dev.locations DROP COLUMN IF EXISTS manager_email;

-- ---------- live (public) ----------
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS manager_email text;

CREATE TABLE IF NOT EXISTS public.manager_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period text NOT NULL,            -- e.g. '2026-12'
  recipient text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, period)
);

ALTER TABLE public.manager_digest_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read manager digest log" ON public.manager_digest_log;
CREATE POLICY "Admins read manager digest log" ON public.manager_digest_log
  FOR SELECT TO authenticated
  USING (public.current_user_role_tier() = 'admin');

GRANT SELECT ON public.manager_digest_log TO authenticated;
GRANT ALL ON public.manager_digest_log TO service_role;

-- ---------- dev ----------
ALTER TABLE dev.locations ADD COLUMN IF NOT EXISTS manager_email text;

CREATE TABLE IF NOT EXISTS dev.manager_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES dev.locations(id) ON DELETE CASCADE,
  period text NOT NULL,
  recipient text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, period)
);

ALTER TABLE dev.manager_digest_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read manager digest log" ON dev.manager_digest_log;
CREATE POLICY "Admins read manager digest log" ON dev.manager_digest_log
  FOR SELECT TO authenticated
  USING (public.current_user_role_tier() = 'admin');

GRANT SELECT ON dev.manager_digest_log TO authenticated;
GRANT ALL ON dev.manager_digest_log TO service_role;

NOTIFY pgrst, 'reload schema';
