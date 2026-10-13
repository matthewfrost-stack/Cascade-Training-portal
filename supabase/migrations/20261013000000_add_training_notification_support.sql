ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS notification_group text NULL,
  ADD COLUMN IF NOT EXISTS link text NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS notifications_event_id_idx
  ON public.notifications (event_id);

CREATE INDEX IF NOT EXISTS notifications_group_idx
  ON public.notifications (type, notification_group);

CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);
