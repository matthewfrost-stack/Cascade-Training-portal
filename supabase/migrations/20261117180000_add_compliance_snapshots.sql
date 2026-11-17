-- Monthly compliance snapshots for the compliance report (CQC "Well-led":
-- showing compliance over time).
--
-- One row per home per month with that month's figures. Saved automatically
-- on the 1st of each month (GitHub Actions, no emails) and by admins from the
-- report. Saving again in the same month replaces that month's row.
-- Written only by the server (service key); admins can read it directly,
-- everyone else reads it through the report API, which applies location access.
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
--
-- ROLLBACK (only if something breaks; this deletes the snapshots):
--   DROP TABLE IF EXISTS public.compliance_snapshots;
--   DROP TABLE IF EXISTS dev.compliance_snapshots;

CREATE TABLE IF NOT EXISTS public.compliance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period text NOT NULL,                 -- e.g. '2026-11'
  taken_at timestamptz NOT NULL DEFAULT now(),
  compliance_pct numeric(5,1),          -- null when no training applies
  required integer NOT NULL DEFAULT 0,  -- cells that apply (not N/A / not yet due)
  in_date integer NOT NULL DEFAULT 0,   -- in date, including expiring soon
  expiring integer NOT NULL DEFAULT 0,
  expired integer NOT NULL DEFAULT 0,
  missing integer NOT NULL DEFAULT 0,
  allocated integer NOT NULL DEFAULT 0,
  staff_count integer NOT NULL DEFAULT 0,
  lda_pct numeric(5,1),                 -- learning disability & autism (Oliver McGowan)
  UNIQUE (location_id, period)
);

CREATE TABLE IF NOT EXISTS dev.compliance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES dev.locations(id) ON DELETE CASCADE,
  period text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  compliance_pct numeric(5,1),
  required integer NOT NULL DEFAULT 0,
  in_date integer NOT NULL DEFAULT 0,
  expiring integer NOT NULL DEFAULT 0,
  expired integer NOT NULL DEFAULT 0,
  missing integer NOT NULL DEFAULT 0,
  allocated integer NOT NULL DEFAULT 0,
  staff_count integer NOT NULL DEFAULT 0,
  lda_pct numeric(5,1),
  UNIQUE (location_id, period)
);

ALTER TABLE public.compliance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.compliance_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read compliance snapshots" ON public.compliance_snapshots;
CREATE POLICY "Admins read compliance snapshots" ON public.compliance_snapshots
  FOR SELECT TO authenticated USING (public.current_user_role_tier() = 'admin');
DROP POLICY IF EXISTS "Admins read compliance snapshots" ON dev.compliance_snapshots;
CREATE POLICY "Admins read compliance snapshots" ON dev.compliance_snapshots
  FOR SELECT TO authenticated USING (public.current_user_role_tier() = 'admin');
GRANT SELECT ON public.compliance_snapshots TO authenticated;
GRANT SELECT ON dev.compliance_snapshots TO authenticated;
GRANT ALL ON public.compliance_snapshots TO service_role;
GRANT ALL ON dev.compliance_snapshots TO service_role;

NOTIFY pgrst, 'reload schema';
