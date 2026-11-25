-- Attendance reasons: the lateness and absence reasons offered in the booking
-- window and on the Intelligence Hub, managed by admins (Admin → Setup →
-- Attendance Reasons) instead of being fixed in the code.
--
-- Pre-filled with today's options. "Removing" a reason only hides it from the
-- dropdowns (is_active = false): bookings keep the text they were saved with,
-- so past figures on the Intelligence Hub don't change.
-- Everyone logged in can read the list; only admins can change it.
-- Applied to both live (public) and dev. Safe to run more than once.
--
-- ROLLBACK (only if something breaks; the app falls back to the built-in lists):
--   DROP TABLE IF EXISTS public.attendance_reasons;
--   DROP TABLE IF EXISTS dev.attendance_reasons;

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.attendance_reasons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL CHECK (kind IN ('late', 'absence')),
        label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 100),
        sort_order integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (kind, label)
      )$f$, s);

    EXECUTE format('ALTER TABLE %I.attendance_reasons ENABLE ROW LEVEL SECURITY', s);
    EXECUTE format('DROP POLICY IF EXISTS "Logged-in users read attendance reasons" ON %I.attendance_reasons', s);
    EXECUTE format('CREATE POLICY "Logged-in users read attendance reasons" ON %I.attendance_reasons
                      FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)', s);
    EXECUTE format('DROP POLICY IF EXISTS "Admins manage attendance reasons" ON %I.attendance_reasons', s);
    EXECUTE format($p$CREATE POLICY "Admins manage attendance reasons" ON %I.attendance_reasons
                      FOR ALL TO authenticated
                      USING (public.current_user_role_tier() = 'admin')
                      WITH CHECK (public.current_user_role_tier() = 'admin')$p$, s);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.attendance_reasons TO authenticated', s);
    EXECUTE format('GRANT ALL ON %I.attendance_reasons TO service_role', s);

    -- Today's options (only added if missing).
    EXECUTE format($f$
      INSERT INTO %I.attendance_reasons (kind, label, sort_order) VALUES
        ('late', 'Traffic', 1), ('late', 'Handover delayed', 2), ('late', 'Public Transport', 3),
        ('late', 'Personal', 4), ('late', 'Other', 5),
        ('absence', 'Appointment', 1), ('absence', 'Needed in home', 2), ('absence', 'Rostering', 3),
        ('absence', 'Transport issues', 4), ('absence', 'Not started yet', 5), ('absence', 'Childcare', 6),
        ('absence', 'Sickness', 7), ('absence', 'Holiday', 8)
      ON CONFLICT (kind, label) DO NOTHING$f$, s);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Check: 26 rows (13 for public, 13 for dev).
SELECT 'public' AS schema, kind, label, sort_order, is_active FROM public.attendance_reasons
UNION ALL
SELECT 'dev', kind, label, sort_order, is_active FROM dev.attendance_reasons
ORDER BY 1, 2, 4;
