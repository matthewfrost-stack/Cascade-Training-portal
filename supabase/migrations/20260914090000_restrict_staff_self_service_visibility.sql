-- Restrict staff to records belonging to their own profile.
--
-- The application also enforces these rules in routes and server endpoints,
-- but these policies prevent a staff user's authenticated Supabase client from
-- bypassing the UI and reading other people's bookings, profiles, locations,
-- or training records directly.

DO $$
DECLARE
  target_table text;
  policy_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles',
    'staff_locations',
    'staff_training_matrix',
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service profile visibility" ON public.profiles
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
        OR id = auth.uid()
      );
    CREATE POLICY "Admin profile management" ON public.profiles
      FOR ALL USING (public.current_user_role_tier() = 'admin')
      WITH CHECK (public.current_user_role_tier() = 'admin');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_locations') THEN
    ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service staff location visibility" ON public.staff_locations
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
        OR staff_id = auth.uid()
      );
    CREATE POLICY "Scheduler staff location management" ON public.staff_locations
      FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
      WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_training_matrix') THEN
    ALTER TABLE public.staff_training_matrix ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service training visibility" ON public.staff_training_matrix
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
        OR staff_id = auth.uid()
      );
    CREATE POLICY "Scheduler training management" ON public.staff_training_matrix
      FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
      WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'training_events') THEN
    ALTER TABLE public.training_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service event visibility" ON public.training_events
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
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
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service booking visibility" ON public.bookings
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
        OR profile_id = auth.uid()
      );
    CREATE POLICY "Scheduler booking management" ON public.bookings
      FOR ALL USING (public.current_user_role_tier() IN ('scheduler', 'admin'))
      WITH CHECK (public.current_user_role_tier() IN ('scheduler', 'admin'));
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'course_event_overrides') THEN
    ALTER TABLE public.course_event_overrides ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Self service event override visibility" ON public.course_event_overrides
      FOR SELECT USING (
        public.current_user_role_tier() IN ('admin', 'manager', 'scheduler')
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
  END IF;
END
$$;
