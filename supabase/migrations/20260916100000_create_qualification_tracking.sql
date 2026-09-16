-- Track NVQ and Diploma enquiries from first contact through completion.
-- The location_id is mandatory so every record follows the same location scope
-- as the rest of the training portal.

-- This helper normally comes from the manager-location migration. Keep this
-- migration safe to run on installations that have the core tables but do not
-- have that later helper yet.
CREATE OR REPLACE FUNCTION public.current_user_role_tier()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role_tier
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.current_user_role_tier() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_role_tier() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_location_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.location_id
  FROM public.staff_locations sl
  WHERE sl.staff_id = auth.uid()
  UNION
  SELECT l.id
  FROM public.locations l
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE l.name = p.location
     OR l.name IN (
       SELECT trim(value)
       FROM jsonb_array_elements_text(
         CASE
           WHEN jsonb_typeof(to_jsonb(p.managed_houses)) = 'array'
             THEN to_jsonb(p.managed_houses)
           ELSE '[]'::jsonb
         END
       ) AS managed(value)
     )
$$;

REVOKE ALL ON FUNCTION public.current_user_location_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_location_ids() TO authenticated;

CREATE TABLE IF NOT EXISTS public.qualification_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  qualification_type TEXT NOT NULL CHECK (qualification_type IN ('nvq', 'diploma')),
  qualification_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  stage TEXT NOT NULL DEFAULT 'enquiry' CHECK (stage IN ('enquiry', 'application', 'offer', 'enrolled', 'in_progress', 'completed', 'withdrawn')),
  enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_completion_date DATE,
  completion_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT qualification_leads_completion_after_enquiry CHECK (
    completion_date IS NULL OR completion_date >= enquiry_date
  )
);

CREATE TABLE IF NOT EXISTS public.qualification_lead_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.qualification_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualification_leads_location_id
  ON public.qualification_leads(location_id);
CREATE INDEX IF NOT EXISTS idx_qualification_leads_stage
  ON public.qualification_leads(stage);
CREATE INDEX IF NOT EXISTS idx_qualification_leads_enquiry_date
  ON public.qualification_leads(enquiry_date DESC);
CREATE INDEX IF NOT EXISTS idx_qualification_lead_timeline_lead_date
  ON public.qualification_lead_timeline(lead_id, event_date DESC);

CREATE OR REPLACE FUNCTION public.touch_qualification_lead_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qualification_leads_touch_updated_at ON public.qualification_leads;
CREATE TRIGGER qualification_leads_touch_updated_at
BEFORE UPDATE ON public.qualification_leads
FOR EACH ROW
EXECUTE FUNCTION public.touch_qualification_lead_updated_at();

ALTER TABLE public.qualification_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualification_lead_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Qualification lead location visibility" ON public.qualification_leads;
CREATE POLICY "Qualification lead location visibility"
ON public.qualification_leads
FOR SELECT
USING (
  public.current_user_role_tier() IN ('admin', 'scheduler')
  OR (
    public.current_user_role_tier() = 'manager'
    AND location_id IN (SELECT public.current_user_location_ids())
  )
);

DROP POLICY IF EXISTS "Qualification lead management" ON public.qualification_leads;
CREATE POLICY "Qualification lead management"
ON public.qualification_leads
FOR ALL
USING (
  public.current_user_role_tier() IN ('admin', 'scheduler')
  OR (
    public.current_user_role_tier() = 'manager'
    AND location_id IN (SELECT public.current_user_location_ids())
  )
)
WITH CHECK (
  public.current_user_role_tier() IN ('admin', 'scheduler')
  OR (
    public.current_user_role_tier() = 'manager'
    AND location_id IN (SELECT public.current_user_location_ids())
  )
);

DROP POLICY IF EXISTS "Qualification timeline location visibility" ON public.qualification_lead_timeline;
CREATE POLICY "Qualification timeline location visibility"
ON public.qualification_lead_timeline
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.qualification_leads lead
    WHERE lead.id = qualification_lead_timeline.lead_id
      AND (
        public.current_user_role_tier() IN ('admin', 'scheduler')
        OR (
          public.current_user_role_tier() = 'manager'
          AND lead.location_id IN (SELECT public.current_user_location_ids())
        )
      )
  )
);

DROP POLICY IF EXISTS "Qualification timeline management" ON public.qualification_lead_timeline;
CREATE POLICY "Qualification timeline management"
ON public.qualification_lead_timeline
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.qualification_leads lead
    WHERE lead.id = qualification_lead_timeline.lead_id
      AND (
        public.current_user_role_tier() IN ('admin', 'scheduler')
        OR (
          public.current_user_role_tier() = 'manager'
          AND lead.location_id IN (SELECT public.current_user_location_ids())
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.qualification_leads lead
    WHERE lead.id = qualification_lead_timeline.lead_id
      AND (
        public.current_user_role_tier() IN ('admin', 'scheduler')
        OR (
          public.current_user_role_tier() = 'manager'
          AND lead.location_id IN (SELECT public.current_user_location_ids())
        )
      )
  )
);
