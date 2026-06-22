-- Ensure public.training_analytics runs with invoker privileges so it respects the querying user's RLS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'training_analytics'
  ) THEN
    EXECUTE 'ALTER VIEW public.training_analytics SET (security_invoker = true)';
  END IF;
END
$$;
