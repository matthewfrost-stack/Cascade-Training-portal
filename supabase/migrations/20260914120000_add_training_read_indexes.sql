-- Supporting indexes for the role-scoped calendar and matrix reads.
-- These are additive and safe to apply to existing data.

CREATE INDEX IF NOT EXISTS idx_training_events_event_date
  ON public.training_events(event_date);

CREATE INDEX IF NOT EXISTS idx_bookings_event_profile
  ON public.bookings(event_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_bookings_profile_event
  ON public.bookings(profile_id, event_id);

CREATE INDEX IF NOT EXISTS idx_course_event_overrides_course_date
  ON public.course_event_overrides(course_id, event_date);

CREATE INDEX IF NOT EXISTS idx_staff_training_matrix_location
  ON public.staff_training_matrix(completed_at_location_id);

CREATE INDEX IF NOT EXISTS idx_location_matrix_dividers_location_order
  ON public.location_matrix_dividers(location_id, display_order);
