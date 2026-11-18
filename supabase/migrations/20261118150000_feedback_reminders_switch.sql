-- Training emails: separate on/off switch for booking reminders.
--
-- feedback_automation_settings.is_enabled now switches ONLY the feedback email
-- (sent to people signed in on the register). The booking reminders (staff N days
-- before + a list to each home's manager Google Group) get their own switch,
-- reminders_enabled, which starts OFF.
--
-- Applied to both the live (public) and dev schemas. Safe to run more than once.
-- ROLLBACK: ALTER TABLE public.feedback_automation_settings DROP COLUMN IF EXISTS reminders_enabled;
--           ALTER TABLE dev.feedback_automation_settings    DROP COLUMN IF EXISTS reminders_enabled;

ALTER TABLE public.feedback_automation_settings ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE dev.feedback_automation_settings    ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
