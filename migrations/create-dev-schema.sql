-- Create dev schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS dev;

-- Copy all tables from public to dev schema
CREATE TABLE IF NOT EXISTS dev.booking_checklist_template_items AS TABLE public.booking_checklist_template_items WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.booking_checklists AS TABLE public.booking_checklists WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.bookings AS TABLE public.bookings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.courses AS TABLE public.courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.profiles AS TABLE public.profiles WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.training_events AS TABLE public.training_events WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.checklist_completions AS TABLE public.checklist_completions WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.course_event_overrides AS TABLE public.course_event_overrides WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.course_feedback AS TABLE public.course_feedback WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.deleted_items AS TABLE public.deleted_items WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.email_logs AS TABLE public.email_logs WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_automation_settings AS TABLE public.feedback_automation_settings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_email_logs AS TABLE public.feedback_email_logs WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_form_config AS TABLE public.feedback_form_config WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.feedback_settings AS TABLE public.feedback_settings WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_courses AS TABLE public.location_courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_matrix_dividers AS TABLE public.location_matrix_dividers WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.location_training_courses AS TABLE public.location_training_courses WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.locations AS TABLE public.locations WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.qualification_lead_timeline AS TABLE public.qualification_lead_timeline WITH NO DATA;
CREATE TABLE IF NOT EXISTS dev.qualification_leads AS TABLE public.qualification_leads WITH NO DATA;

-- Copy any additional tables from schema.sql that we might have missed
CREATE TABLE IF NOT EXISTS dev.staff_locations AS TABLE public.staff_locations WITH NO DATA;

-- Enable RLS on all dev tables (copy settings from public)
ALTER TABLE dev.booking_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.booking_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.training_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.checklist_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.course_event_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.course_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.deleted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.feedback_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.feedback_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.feedback_form_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.feedback_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.location_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.location_matrix_dividers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.location_training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.qualification_lead_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.qualification_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.staff_locations ENABLE ROW LEVEL SECURITY;

-- Note: You'll need to manually copy RLS policies from public schema policies
-- Go to Authentication > Policies in Supabase dashboard and duplicate each policy,
-- changing the table schema from "public" to "dev"
