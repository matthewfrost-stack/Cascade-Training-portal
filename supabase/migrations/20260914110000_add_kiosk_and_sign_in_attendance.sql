-- Attendance provenance and Sign In App integration support.
-- All changes are additive so existing roster screens and historical records
-- remain compatible with the older lateness column names.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS minutes_late INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_reason TEXT,
  ADD COLUMN IF NOT EXISTS attendance_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_marked_by UUID REFERENCES public.profiles(id);

-- Older deployments use these names. Keep them available while the active UI
-- moves towards minutes_late/late_reason.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS lateness_minutes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lateness_reason TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sign_in_app_visitor_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_sign_in_app_visitor_id_idx
  ON public.profiles(sign_in_app_visitor_id)
  WHERE sign_in_app_visitor_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sign_in_app_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

ALTER TABLE public.sign_in_app_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.bookings.attendance_source IS
  'manual, kiosk, or sign_in_app; kiosk is the trainer override source';
