-- Refresh PostgREST schema cache for booking checklist template items.
-- This ensures the new table is available to Supabase client queries after deployment.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'booking_checklist_template_items'
  ) THEN
    NOTIFY pgrst, 'reload schema';
  END IF;
END
$$;
