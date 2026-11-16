-- Follow-up to 20261116120000_tighten_open_rls_policies.sql, from the
-- verify-rls-lockdown.sql health check.
--
-- 1. public.sheet_sync_configs had a policy named "Admins manage sheet sync
--    configs" whose condition was always true, so anyone with the public key
--    could read, change or delete it. Restrict it to admins as intended.
--    The service key (server jobs, scripts) bypasses RLS and is unaffected.
--
-- 2. public.handle_new_user() is the sign-up trigger that creates a profile.
--    It runs with owner rights (SECURITY DEFINER) and was executable by anon.
--    Triggers do not need callers to hold EXECUTE, so revoking it keeps
--    sign-ups working while stopping direct calls.
--
-- ROLLBACK (only if something breaks):
--   DROP POLICY IF EXISTS "Admins manage sheet sync configs" ON public.sheet_sync_configs;
--   CREATE POLICY "Admins manage sheet sync configs" ON public.sheet_sync_configs
--     FOR ALL USING (true) WITH CHECK (true);
--   GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon, authenticated;

DROP POLICY IF EXISTS "Admins manage sheet sync configs" ON public.sheet_sync_configs;
CREATE POLICY "Admins manage sheet sync configs" ON public.sheet_sync_configs
  FOR ALL TO authenticated
  USING (public.current_user_role_tier() = 'admin')
  WITH CHECK (public.current_user_role_tier() = 'admin');

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
