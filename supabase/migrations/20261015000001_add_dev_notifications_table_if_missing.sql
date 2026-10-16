-- Mirror the notifications table into dev schema so dev branch can query without 404s.
CREATE TABLE IF NOT EXISTS dev.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  type text NOT NULL,
  referral_id uuid NULL,
  ticket_update_id uuid NULL,
  notification_group text NULL,
  title text NOT NULL,
  body text NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  read_at timestamptz NULL,
  link text NULL
);

CREATE INDEX IF NOT EXISTS dev_notifications_recipient_created_idx
  ON dev.notifications (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dev_notifications_recipient_unread_idx
  ON dev.notifications (recipient_user_id, is_read, created_at DESC);

ALTER TABLE dev.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON dev.notifications;
CREATE POLICY "Users read own notifications"
  ON dev.notifications
  FOR SELECT
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON dev.notifications;
CREATE POLICY "Users update own notifications"
  ON dev.notifications
  FOR UPDATE
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own notifications" ON dev.notifications;
CREATE POLICY "Users delete own notifications"
  ON dev.notifications
  FOR DELETE
  USING (recipient_user_id = auth.uid());
