-- Training emails: separate on/off switch for booking reminders.
--
-- feedback_automation_settings.is_enabled now switches ONLY the feedback email
-- (sent to people signed in on the register). The booking reminders (staff N days
-- before + a list to each home's manager Google Group) get their own switch,
-- reminders_enabled, which starts OFF.
--
-- Also adds the session "sent" markers dev was missing (see below).
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
-- ROLLBACK: ALTER TABLE public.feedback_automation_settings DROP COLUMN IF EXISTS reminders_enabled;
--           ALTER TABLE dev.feedback_automation_settings    DROP COLUMN IF EXISTS reminders_enabled;

ALTER TABLE public.feedback_automation_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE dev.feedback_automation_settings    ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;

-- The "already sent" markers on sessions were only ever added to live
-- (20260821000000 touched public only), so sending from dev failed with a 500.
ALTER TABLE public.training_events
  ADD COLUMN IF NOT EXISTS feedback_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_7_days_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1_day_sent_at timestamptz;
ALTER TABLE dev.training_events
  ADD COLUMN IF NOT EXISTS feedback_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_7_days_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1_day_sent_at timestamptz;

NOTIFY pgrst, 'reload schema';
