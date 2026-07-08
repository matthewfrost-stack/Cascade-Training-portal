-- Ensure training_courses has category metadata and that checklist template items exist.
-- This migration is safe to run on environments with or without the existing schema.

ALTER TABLE public.training_courses
  ADD COLUMN IF NOT EXISTS category VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_training_courses_category ON public.training_courses(category);

CREATE TABLE IF NOT EXISTS public.booking_checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL UNIQUE,
  item_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_invoice_number BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_checklist_template_items_active_order
  ON public.booking_checklist_template_items(is_active, item_order);

INSERT INTO public.booking_checklist_template_items (item_name, item_order, is_active, is_invoice_number)
VALUES
  ('Invoice Number', 1, TRUE, TRUE),
  ('Reminder Email Sent?', 2, TRUE, FALSE),
  ('Numbers sent to Provider?', 3, TRUE, FALSE),
  ('Attendance register printed?', 4, TRUE, FALSE),
  ('Feedback forms printed?', 5, TRUE, FALSE),
  ('Attendance register scanned?', 6, TRUE, FALSE),
  ('Feedback form scanned?', 7, TRUE, FALSE),
  ('Attendee Names to Provider', 8, TRUE, FALSE),
  ('Attendee Form to Homes NA', 9, TRUE, FALSE),
  ('Matrix Updated?', 10, TRUE, FALSE),
  ('Monday Updated?', 11, TRUE, FALSE),
  ('Invoice/splits sent to finance?', 12, TRUE, FALSE),
  ('Certificates in Drive?', 13, TRUE, FALSE)
ON CONFLICT (item_name) DO NOTHING;

ALTER TABLE public.booking_checklist_template_items DISABLE ROW LEVEL SECURITY;

-- Refresh PostgREST schema cache for the updated tables.
NOTIFY pgrst, 'reload schema';
