-- Managers may only read records belonging to their assigned locations.
--
-- The app stores manager assignments in both staff_locations and the legacy
-- managed_houses/profile.location fields. These security-definer helpers make
-- that same scope available to RLS without recursive policy evaluation.

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

CREATE OR REPLACE FUNCTION public.manager_can_access_profile(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_tier() = 'manager'
    AND EXISTS (
      SELECT 1
      FROM public.staff_locations sl
      WHERE sl.staff_id = target_profile_id
        AND sl.location_id IN (SELECT public.current_user_location_ids())
      UNION ALL
      SELECT 1
      FROM public.profiles p
      JOIN public.locations l ON l.name = p.location
      WHERE p.id = target_profile_id
        AND l.id IN (SELECT public.current_user_location_ids())
    )
$$;

CREATE OR REPLACE FUNCTION public.manager_can_access_event(target_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_tier() = 'manager'
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.staff_locations sl ON sl.staff_id = b.profile_id
      WHERE b.event_id = target_event_id
        AND sl.location_id IN (SELECT public.current_user_location_ids())
      UNION ALL
      SELECT 1
      FROM public.bookings b
      JOIN public.profiles p ON p.id = b.profile_id
      JOIN public.locations l ON l.name = p.location
      WHERE b.event_id = target_event_id
        AND l.id IN (SELECT public.current_user_location_ids())
    )
$$;

CREATE OR REPLACE FUNCTION public.manager_can_access_course_event(target_course_id uuid, target_event_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_tier() = 'manager'
    AND EXISTS (
      SELECT 1
      FROM public.training_events te
      WHERE te.course_id = target_course_id
        AND te.event_date = target_event_date
        AND public.manager_can_access_event(te.id)
    )
$$;

CREATE OR REPLACE FUNCTION public.manager_can_access_office_region(target_region text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role_tier() = 'manager'
    AND EXISTS (
      SELECT 1
      FROM public.locations l
      WHERE l.office_region = target_region
        AND l.id IN (SELECT public.current_user_location_ids())
    )
$$;

REVOKE ALL ON FUNCTION public.current_user_location_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_can_access_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_can_access_event(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_can_access_course_event(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manager_can_access_office_region(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_location_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_can_access_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_can_access_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_can_access_course_event(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_can_access_office_region(text) TO authenticated;

DO $$
DECLARE
  target_table text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles',
    'staff_locations',
    'staff_training_matrix',
    'locations',
    'location_courses',
    'location_training_courses',
    'location_matrix_dividers',
    'venues',
    'training_events',
    'bookings',
    'course_event_overrides'
  ] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = target_table
    ) THEN
      FOR policy_name IN
        SELECT pol.polname
        FROM pg_policy pol
        JOIN pg_class cls ON cls.oid = pol.polrelid
        JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
        WHERE nsp.nspname = 'public'
          AND cls.relname = target_table
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location profile visibility" ON public.profiles
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR id = auth.uid()
    OR public.manager_can_access_profile(id)
  );
CREATE POLICY "Admin profile management" ON public.profiles
  FOR ALL USING (public.current_user_role_tier() = 'admin')
  WITH CHECK (public.current_user_role_tier() = 'admin');

ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location link visibility" ON public.staff_locations
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR staff_id = auth.uid()
    OR (
      public.current_user_role_tier() = 'manager'
      AND location_id IN (SELECT public.current_user_location_ids())
    )
  );
CREATE POLICY "Scheduler staff location management" ON public.staff_locations
  FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
  WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));

ALTER TABLE public.staff_training_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location training visibility" ON public.staff_training_matrix
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR staff_id = auth.uid()
    OR (
      public.current_user_role_tier() = 'manager'
      AND completed_at_location_id IN (SELECT public.current_user_location_ids())
    )
  );
CREATE POLICY "Scheduler training management" ON public.staff_training_matrix
  FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
  WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location visibility" ON public.locations
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR id IN (SELECT public.current_user_location_ids())
  );
CREATE POLICY "Admin location management" ON public.locations
  FOR ALL USING (public.current_user_role_tier() = 'admin')
  WITH CHECK (public.current_user_role_tier() = 'admin');

ALTER TABLE public.location_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location course visibility" ON public.location_courses
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR location_id IN (SELECT public.current_user_location_ids())
  );
CREATE POLICY "Admin location course management" ON public.location_courses
  FOR ALL USING (public.current_user_role_tier() = 'admin')
  WITH CHECK (public.current_user_role_tier() = 'admin');

ALTER TABLE public.location_training_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location training course visibility" ON public.location_training_courses
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR location_id IN (SELECT public.current_user_location_ids())
  );
CREATE POLICY "Admin location training course management" ON public.location_training_courses
  FOR ALL USING (public.current_user_role_tier() = 'admin')
  WITH CHECK (public.current_user_role_tier() = 'admin');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'location_matrix_dividers') THEN
    ALTER TABLE public.location_matrix_dividers ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Manager location divider visibility" ON public.location_matrix_dividers
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'scheduler')
        OR location_id IN (SELECT public.current_user_location_ids())
      );
    CREATE POLICY "Scheduler divider management" ON public.location_matrix_dividers
      FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
      WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venues') THEN
    ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Manager office venue visibility" ON public.venues
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'scheduler')
        OR public.manager_can_access_office_region(office_region)
      );
    CREATE POLICY "Admin venue management" ON public.venues
      FOR ALL USING (public.current_user_role_tier() = 'admin')
      WITH CHECK (public.current_user_role_tier() = 'admin');
  END IF;
END
$$;

ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location event visibility" ON public.training_events
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR public.manager_can_access_event(id)
    OR (
      public.current_user_role_tier() = 'staff'
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.event_id = training_events.id
          AND b.profile_id = auth.uid()
      )
    )
  );
CREATE POLICY "Scheduler event management" ON public.training_events
  FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
  WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location booking visibility" ON public.bookings
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR public.manager_can_access_event(event_id)
    OR profile_id = auth.uid()
  );
CREATE POLICY "Scheduler booking management" ON public.bookings
  FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
  WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));

ALTER TABLE public.course_event_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manager location event override visibility" ON public.course_event_overrides
  FOR SELECT USING (
    public.current_user_role_tier() IN ('admin', 'scheduler')
    OR public.manager_can_access_course_event(course_id, event_date)
    OR (
      public.current_user_role_tier() = 'staff'
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.training_events te ON te.id = b.event_id
        WHERE b.profile_id = auth.uid()
          AND te.course_id = course_event_overrides.course_id
          AND te.event_date = course_event_overrides.event_date
      )
    )
  );
CREATE POLICY "Scheduler event override management" ON public.course_event_overrides
  FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
  WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));
