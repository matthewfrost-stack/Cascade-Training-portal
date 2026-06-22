-- Ensure public.staff_training_stats runs with invoker privileges so it respects the querying user's RLS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'staff_training_stats'
  ) THEN
    EXECUTE 'ALTER VIEW public.staff_training_stats SET (security_invoker = true)';
  END IF;
END
$$;
