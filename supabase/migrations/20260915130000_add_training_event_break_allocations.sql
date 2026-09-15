-- Store the planned break allocation for each training session.
-- These are event-level values because the same course can have different
-- breaks depending on the session and number of attendees.
ALTER TABLE public.training_events
  ADD COLUMN IF NOT EXISTS am_break_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pm_break_minutes INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.training_events
  DROP CONSTRAINT IF EXISTS training_events_am_break_minutes_check,
  DROP CONSTRAINT IF EXISTS training_events_pm_break_minutes_check,
  ADD CONSTRAINT training_events_am_break_minutes_check CHECK (am_break_minutes >= 0 AND am_break_minutes <= 1440),
  ADD CONSTRAINT training_events_pm_break_minutes_check CHECK (pm_break_minutes >= 0 AND pm_break_minutes <= 1440);

COMMENT ON COLUMN public.training_events.am_break_minutes IS 'Planned morning break duration in minutes for this session';
COMMENT ON COLUMN public.training_events.pm_break_minutes IS 'Planned afternoon break duration in minutes for this session';
