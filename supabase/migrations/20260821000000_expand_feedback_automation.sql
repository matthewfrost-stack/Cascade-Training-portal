-- Expand feedback automation into configurable booking reminders and feedback delivery.
-- All changes are additive so existing automation settings and event history remain valid.

ALTER TABLE public.feedback_automation_settings
  ADD COLUMN IF NOT EXISTS reminder_7_days_before INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS reminder_1_day_before INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS feedback_minutes_before_end INT,
  ADD COLUMN IF NOT EXISTS reminder_subject TEXT DEFAULT 'Training reminder: {{course_name}}',
  ADD COLUMN IF NOT EXISTS reminder_body TEXT DEFAULT 'Hi {{staff_name}},\n\nThis is a reminder that you are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}.\n\nBest regards,\nThe Training Team',
  ADD COLUMN IF NOT EXISTS manager_reminder_subject TEXT DEFAULT 'Training reminder for {{course_name}}',
  ADD COLUMN IF NOT EXISTS manager_reminder_body TEXT DEFAULT 'The following staff are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}:\n\n{{staff_list}}\n\nThe Training Team';

-- Backfill the new feedback offset from the original setting where available.
UPDATE public.feedback_automation_settings
SET feedback_minutes_before_end = CASE
  WHEN minutes_before_end IS NULL OR minutes_before_end = 30 THEN 60
  ELSE minutes_before_end
END
WHERE feedback_minutes_before_end IS NULL;

ALTER TABLE public.feedback_automation_settings
  ALTER COLUMN feedback_minutes_before_end SET DEFAULT 60;

ALTER TABLE public.training_events
  ADD COLUMN IF NOT EXISTS reminder_7_days_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1_day_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.feedback_automation_settings.reminder_7_days_before IS 'Days before the event start time to send the first booking reminder.';
COMMENT ON COLUMN public.feedback_automation_settings.reminder_1_day_before IS 'Days before the event start time to send the second booking reminder.';
COMMENT ON COLUMN public.feedback_automation_settings.feedback_minutes_before_end IS 'Minutes before the event end time to send feedback requests.';
