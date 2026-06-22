-- Ensure public.calendar_view runs with invoker privileges so it respects the querying user's RLS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'calendar_view'
  ) THEN
    EXECUTE 'ALTER VIEW public.calendar_view SET (security_invoker = true)';
  END IF;
END
$$;
