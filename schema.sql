


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "templates";


ALTER SCHEMA "templates" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."user_role" AS ENUM (
    'staff',
    'manager',
    'scheduler',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_expiry_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_expiry_months INT;
  v_course_id UUID;
BEGIN
  v_course_id := NEW.course_id;
  
  IF v_course_id IS NOT NULL AND NEW.completion_date IS NOT NULL THEN
    SELECT c.expiry_months INTO v_expiry_months
    FROM courses c
    WHERE c.id = v_course_id;
    
    IF v_expiry_months IS NOT NULL THEN
      NEW.expiry_date := NEW.completion_date + (INTERVAL '1 month' * v_expiry_months);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_expiry_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_staff_time_conflict"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM bookings b
    JOIN training_events te_existing ON b.event_id = te_existing.id
    JOIN training_events te_new ON te_new.id = NEW.event_id
    WHERE b.profile_id = NEW.profile_id
    AND te_existing.event_date = te_new.event_date
    AND te_new.start_time < te_existing.end_time
    AND te_new.end_time > te_existing.start_time
  ) THEN
    RAISE EXCEPTION 'This staff member is already booked for another session during this time period.';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_staff_time_conflict"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_location_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT sl.location_id
  FROM public.staff_locations sl
  WHERE sl.staff_id = auth.uid()
  UNION
  SELECT l.id
  FROM public.locations l
  JOIN public.profiles p ON p.id = auth.uid()
  WHERE l.name = p.location
     OR l.name IN (
       SELECT trim(value)
       FROM jsonb_array_elements_text(
         CASE
           WHEN jsonb_typeof(to_jsonb(p.managed_houses)) = 'array'
             THEN to_jsonb(p.managed_houses)
           ELSE '[]'::jsonb
         END
       ) AS managed(value)
     )
$$;


ALTER FUNCTION "public"."current_user_location_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_user_role_tier"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.role_tier
  FROM public.profiles p
  WHERE p.id = auth.uid()
  LIMIT 1
$$;


ALTER FUNCTION "public"."current_user_role_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, location, role_tier)
  VALUES (
    new.id, 
    new.email, 
    COALESCE(new.raw_user_meta_data->>'full_name', 'New Staff'),
    'Head Office', 
    'staff'
  )
  ON CONFLICT (id) DO NOTHING; -- Prevents crash if profile already exists

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_qualification_lead_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_qualification_lead_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_course_data"("p_course_id" "uuid", "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE courses
  SET 
    name = COALESCE((p_updates->>'name')::VARCHAR, courses.name),
    category = COALESCE((p_updates->>'category')::VARCHAR, courses.category),
    display_order = COALESCE((p_updates->>'display_order')::INTEGER, courses.display_order),
    expiry_months = COALESCE((p_updates->>'expiry_months')::INTEGER, courses.expiry_months)
  WHERE courses.id = p_course_id;
  
  SELECT jsonb_build_object(
    'id', id,
    'name', name,
    'category', category,
    'display_order', display_order,
    'expiry_months', expiry_months
  ) INTO v_result
  FROM courses
  WHERE id = p_course_id;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."update_course_data"("p_course_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."booking_checklist_template_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_name" "text" NOT NULL,
    "item_order" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_invoice_number" boolean DEFAULT false NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."booking_checklist_template_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "item_name" "text" NOT NULL,
    "item_order" integer NOT NULL,
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."booking_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "attended_at" timestamp with time zone,
    "lateness_reason" "text",
    "absence_reason" "text",
    "booked_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "is_late" boolean DEFAULT false,
    "late_reason" "text",
    "minutes_late" integer DEFAULT 0,
    "attendance_source" "text" DEFAULT 'manual'::"text",
    "attendance_marked_at" timestamp with time zone,
    "attendance_marked_by" "uuid",
    "lateness_minutes" integer DEFAULT 0
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."bookings"."attendance_source" IS 'manual, kiosk, or sign_in_app; kiosk is the trainer override source';



CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "max_attendees" integer DEFAULT 15,
    "is_single_trainer" boolean DEFAULT false,
    "display_order" integer DEFAULT 999,
    "category" character varying(100),
    "expiry_months" integer DEFAULT 12
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "location" "text" NOT NULL,
    "role_tier" "public"."user_role" DEFAULT 'staff'::"public"."user_role",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "managed_locations" "text"[] DEFAULT '{}'::"text"[],
    "home_house" "text",
    "managed_houses" "text"[] DEFAULT '{}'::"text"[],
    "password_needs_change" boolean DEFAULT false,
    "is_deleted" boolean DEFAULT false,
    "deleted_at" timestamp without time zone,
    "phone_number" "text",
    "avatar_path" "text",
    "sign_in_app_visitor_id" "text",
    CONSTRAINT "profiles_role_tier_check" CHECK (("role_tier" = ANY (ARRAY['staff'::"public"."user_role", 'manager'::"public"."user_role", 'scheduler'::"public"."user_role", 'admin'::"public"."user_role"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_deleted" IS 'Soft delete flag - TRUE means user is deleted but record kept for analytics';



COMMENT ON COLUMN "public"."profiles"."deleted_at" IS 'Timestamp when user was deleted';



CREATE TABLE IF NOT EXISTS "public"."training_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "location" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "invoice_number" "text",
    "checklist_flags" "jsonb" DEFAULT '[]'::"jsonb",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "venue_id" "uuid",
    "feedback_sent_at" timestamp with time zone,
    "notes" "text",
    "reminder_7_days_sent_at" timestamp with time zone,
    "reminder_1_day_sent_at" timestamp with time zone,
    "am_break_minutes" integer DEFAULT 0 NOT NULL,
    "pm_break_minutes" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "training_events_am_break_minutes_check" CHECK ((("am_break_minutes" >= 0) AND ("am_break_minutes" <= 1440))),
    CONSTRAINT "training_events_pm_break_minutes_check" CHECK ((("pm_break_minutes" >= 0) AND ("pm_break_minutes" <= 1440)))
);


ALTER TABLE "public"."training_events" OWNER TO "postgres";


COMMENT ON COLUMN "public"."training_events"."am_break_minutes" IS 'Planned morning break duration in minutes for this session';



COMMENT ON COLUMN "public"."training_events"."pm_break_minutes" IS 'Planned afternoon break duration in minutes for this session';



CREATE OR REPLACE VIEW "public"."calendar_view" WITH ("security_invoker"='true') AS
 SELECT "te"."id",
    "te"."course_id",
    "te"."location",
    "te"."event_date",
    "te"."start_time",
    "te"."end_time",
    "te"."invoice_number",
    "te"."checklist_flags",
    "te"."created_by",
    "te"."created_at",
    "c"."name" AS "course_name",
    "c"."max_attendees",
    ( SELECT "count"(*) AS "count"
           FROM "public"."bookings" "b"
          WHERE ("b"."event_id" = "te"."id")) AS "current_attendees",
    ( SELECT "json_agg"("json_build_object"('name', "p"."full_name", 'id', "b"."id", 'attended', "b"."attended_at")) AS "json_agg"
           FROM ("public"."bookings" "b"
             JOIN "public"."profiles" "p" ON (("b"."profile_id" = "p"."id")))
          WHERE ("b"."event_id" = "te"."id")) AS "attendee_list"
   FROM ("public"."training_events" "te"
     JOIN "public"."courses" "c" ON (("te"."course_id" = "c"."id")));


ALTER VIEW "public"."calendar_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checklist_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "checklist_item_id" "uuid" NOT NULL,
    "completed_by" "uuid" NOT NULL,
    "completed_by_name" "text" NOT NULL,
    "completed_at" timestamp without time zone DEFAULT "now"(),
    "value" "text"
);


ALTER TABLE "public"."checklist_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_event_overrides" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "event_date" "date" NOT NULL,
    "max_attendees" integer NOT NULL,
    "reason" "text",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."course_event_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."course_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "event_id" "text",
    "course_name" "text",
    "event_date" "date",
    "respondent_name" "text" NOT NULL,
    "session_time" "text" NOT NULL,
    "knowledge_before" smallint NOT NULL,
    "knowledge_after" smallint NOT NULL,
    "confidence_before" smallint NOT NULL,
    "confidence_after" smallint NOT NULL,
    "work_role_relevance" smallint NOT NULL,
    "session_descriptors" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "skills_gained" boolean NOT NULL,
    "additional_comments" "text",
    "responses" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "course_feedback_confidence_after_check" CHECK ((("confidence_after" >= 1) AND ("confidence_after" <= 10))),
    CONSTRAINT "course_feedback_confidence_before_check" CHECK ((("confidence_before" >= 1) AND ("confidence_before" <= 10))),
    CONSTRAINT "course_feedback_knowledge_after_check" CHECK ((("knowledge_after" >= 1) AND ("knowledge_after" <= 10))),
    CONSTRAINT "course_feedback_knowledge_before_check" CHECK ((("knowledge_before" >= 1) AND ("knowledge_before" <= 10))),
    CONSTRAINT "course_feedback_work_role_relevance_check" CHECK ((("work_role_relevance" >= 1) AND ("work_role_relevance" <= 10)))
);


ALTER TABLE "public"."course_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deleted_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text" NOT NULL,
    "location_id" "uuid",
    "snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "deleted_by" "uuid",
    "deleted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "restored_by" "uuid",
    "restored_at" timestamp with time zone
);


ALTER TABLE "public"."deleted_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."deleted_items" IS 'Global archive/recycle bin entries for deleted entities with snapshots for restore.';



CREATE TABLE IF NOT EXISTS "public"."email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subject" "text" NOT NULL,
    "status" "text" NOT NULL,
    "test_mode" boolean DEFAULT false NOT NULL,
    "provider" "text",
    "message_id" "text",
    "error_text" "text",
    "original_recipients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "delivered_recipients" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "email_logs_status_check" CHECK (("status" = ANY (ARRAY['sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."email_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_automation_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_enabled" boolean DEFAULT false,
    "minutes_before_end" integer DEFAULT 30,
    "email_subject" "text" DEFAULT 'Feedback for {{course_name}}'::"text",
    "email_body" "text" DEFAULT 'Hi {{staff_name}},\n\nThank you for attending {{course_name}} today. We would love to hear your feedback.\n\nPlease click here to provide your feedback: {{feedback_link}}\n\nBest regards,\nThe Training Team'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "reminder_7_days_before" integer DEFAULT 7,
    "reminder_1_day_before" integer DEFAULT 1,
    "feedback_minutes_before_end" integer DEFAULT 60,
    "reminder_subject" "text" DEFAULT 'Training reminder: {{course_name}}'::"text",
    "reminder_body" "text" DEFAULT 'Hi {{staff_name}},\n\nThis is a reminder that you are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}.\n\nBest regards,\nThe Training Team'::"text",
    "manager_reminder_subject" "text" DEFAULT 'Training reminder for {{course_name}}'::"text",
    "manager_reminder_body" "text" DEFAULT 'The following staff are scheduled to attend {{course_name}} on {{event_date}} from {{start_time}} to {{end_time}}:\n\n{{staff_list}}\n\nThe Training Team'::"text"
);


ALTER TABLE "public"."feedback_automation_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."feedback_automation_settings"."reminder_7_days_before" IS 'Days before the event start time to send the first booking reminder.';



COMMENT ON COLUMN "public"."feedback_automation_settings"."reminder_1_day_before" IS 'Days before the event start time to send the second booking reminder.';



COMMENT ON COLUMN "public"."feedback_automation_settings"."feedback_minutes_before_end" IS 'Minutes before the event end time to send feedback requests.';



CREATE TABLE IF NOT EXISTS "public"."feedback_email_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "event_id" "uuid" NOT NULL,
    "total_attendees" integer NOT NULL,
    "emails_sent" integer DEFAULT 0 NOT NULL,
    "emails_failed" integer DEFAULT 0 NOT NULL,
    "trigger_time" timestamp with time zone NOT NULL,
    "trigger_type" "text" DEFAULT 'manual'::"text" NOT NULL,
    "additional_notes" "text"
);


ALTER TABLE "public"."feedback_email_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_form_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "form_name" "text" DEFAULT 'Default Feedback Form'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "scale_questions" "jsonb" DEFAULT '[{"id": "knowledge", "label": "Knowledge", "questions": [{"id": "knowledge_before", "label": "Before this session", "required": true}, {"id": "knowledge_after", "label": "After this session", "required": true}]}, {"id": "confidence", "label": "Confidence", "questions": [{"id": "confidence_before", "label": "Before this session", "required": true}, {"id": "confidence_after", "label": "After this session", "required": true}]}, {"id": "relevance", "label": "Relevance", "questions": [{"id": "work_role_relevance", "label": "How relevant was this training to your work role?", "required": true}]}]'::"jsonb",
    "descriptor_options" "jsonb" DEFAULT '["Well tutored", "Useful", "Basic", "Practical", "Fun", "Nothing New", "Professional", "Informative", "Boring", "Motivating", "Too Long", "Educational", "Hard to follow", "Vague", "Participative", "Interactive", "Disorganised"]'::"jsonb",
    "min_descriptors" integer DEFAULT 5,
    "boolean_questions" "jsonb" DEFAULT '[{"id": "skills_gained", "label": "Did you gain new skills?", "options": [{"label": "Yes", "value": true}, {"label": "No", "value": false}], "required": true}]'::"jsonb",
    "text_questions" "jsonb" DEFAULT '[{"id": "respondent_name", "type": "text", "label": "Your Name", "required": true, "placeholder": "Enter your full name"}, {"id": "additional_comments", "rows": 3, "type": "textarea", "label": "Additional Comments", "required": false, "placeholder": "Anything else you''d like to share..."}]'::"jsonb",
    "session_time_options" "jsonb" DEFAULT '["Morning", "Afternoon", "All Day"]'::"jsonb",
    "session_time_required" boolean DEFAULT true
);


ALTER TABLE "public"."feedback_form_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feedback_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feedback_settings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."it_referrals_ticket_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."it_referrals_ticket_number_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_courses" (
    "id" bigint NOT NULL,
    "location_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "is_required" boolean DEFAULT true,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "delivery_type" character varying(255) DEFAULT 'Face to Face'::character varying
);


ALTER TABLE "public"."location_courses" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."location_courses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."location_courses_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."location_courses_id_seq" OWNED BY "public"."location_courses"."id";



CREATE TABLE IF NOT EXISTS "public"."location_matrix_dividers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "name" character varying(255) NOT NULL,
    "display_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."location_matrix_dividers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_training_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "training_course_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."location_training_courses" OWNER TO "postgres";


COMMENT ON TABLE "public"."location_training_courses" IS 'Maps training courses to locations in the training matrix.';



CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "office_region" "text" DEFAULT 'Hull'::"text",
    "accessible_office_regions" "text"[] DEFAULT ARRAY['Hull'::"text"],
    "color" "text" DEFAULT '#3B82F6'::"text"
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."locations"."accessible_office_regions" IS 'Array of office regions this location can access: [Hull], [Norwich], or [Hull, Norwich]';



CREATE TABLE IF NOT EXISTS "public"."qualification_lead_timeline" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."qualification_lead_timeline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qualification_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "location_id" "uuid" NOT NULL,
    "qualification_type" "text" NOT NULL,
    "qualification_name" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "stage" "text" DEFAULT 'enquiry'::"text" NOT NULL,
    "enquiry_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "target_completion_date" "date",
    "completion_date" "date",
    "notes" "text",
    "created_by" "uuid",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "qualification_leads_completion_after_enquiry" CHECK ((("completion_date" IS NULL) OR ("completion_date" >= "enquiry_date"))),
    CONSTRAINT "qualification_leads_qualification_type_check" CHECK (("qualification_type" = ANY (ARRAY['nvq'::"text", 'diploma'::"text"]))),
    CONSTRAINT "qualification_leads_stage_check" CHECK (("stage" = ANY (ARRAY['enquiry'::"text", 'application'::"text", 'offer'::"text", 'enrolled'::"text", 'in_progress'::"text", 'completed'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."qualification_leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sign_in_app_webhook_events" (
    "id" bigint NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_error" "text"
);


ALTER TABLE "public"."sign_in_app_webhook_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."sign_in_app_webhook_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."sign_in_app_webhook_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."sign_in_app_webhook_events_id_seq" OWNED BY "public"."sign_in_app_webhook_events"."id";



CREATE TABLE IF NOT EXISTS "public"."staff_locations" (
    "id" bigint NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "role" character varying(100),
    "created_at" timestamp without time zone DEFAULT "now"(),
    "display_order" integer
);


ALTER TABLE "public"."staff_locations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."staff_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_locations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_locations_id_seq" OWNED BY "public"."staff_locations"."id";



CREATE TABLE IF NOT EXISTS "public"."staff_training_locations" (
    "id" bigint NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "role" character varying(100),
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."staff_training_locations" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."staff_training_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_training_locations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_training_locations_id_seq" OWNED BY "public"."staff_training_locations"."id";



CREATE TABLE IF NOT EXISTS "public"."staff_training_matrix" (
    "id" bigint NOT NULL,
    "staff_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "completion_date" "date",
    "expiry_date" "date",
    "status" character varying(50) DEFAULT 'completed'::character varying,
    "completed_at_location_id" "uuid",
    "created_at" timestamp without time zone DEFAULT "now"(),
    "updated_at" timestamp without time zone DEFAULT "now"(),
    "booking_course_id" "uuid"
);


ALTER TABLE "public"."staff_training_matrix" OWNER TO "postgres";


COMMENT ON COLUMN "public"."staff_training_matrix"."course_id" IS 'References training_courses table (Careskills courses)';



COMMENT ON COLUMN "public"."staff_training_matrix"."booking_course_id" IS 'Optional reference to booking calendar course';



CREATE SEQUENCE IF NOT EXISTS "public"."staff_training_matrix_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."staff_training_matrix_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."staff_training_matrix_id_seq" OWNED BY "public"."staff_training_matrix"."id";



CREATE OR REPLACE VIEW "public"."staff_training_stats" WITH ("security_invoker"='true') AS
 SELECT "p"."full_name",
    "p"."home_house",
    "count"("b"."id") FILTER (WHERE ("b"."attended_at" IS NOT NULL)) AS "courses_completed",
    "count"("b"."id") FILTER (WHERE ("b"."absence_reason" IS NOT NULL)) AS "total_absences"
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."bookings" "b" ON (("p"."id" = "b"."profile_id")))
  GROUP BY "p"."id", "p"."full_name", "p"."home_house";


ALTER VIEW "public"."staff_training_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referral_id" "uuid" NOT NULL,
    "update_text" "text" NOT NULL,
    "updated_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "author_user_id" "uuid",
    "is_internal" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."ticket_updates" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."training_analytics" WITH ("security_invoker"='true') AS
 SELECT "c"."name" AS "course_name",
    "count"("b"."id") AS "total_booked",
    "count"("b"."attended_at") AS "total_attended",
    "count"("b"."id") FILTER (WHERE ("b"."attended_at" IS NULL)) AS "total_absent",
    "count"("b"."id") FILTER (WHERE ("b"."is_late" = true)) AS "total_late",
        CASE
            WHEN ("count"("b"."id") = 0) THEN (0)::numeric
            ELSE "round"(((("count"("b"."attended_at"))::numeric / ("count"("b"."id"))::numeric) * (100)::numeric))
        END AS "attendance_percentage"
   FROM (("public"."courses" "c"
     LEFT JOIN "public"."training_events" "te" ON (("c"."id" = "te"."course_id")))
     LEFT JOIN "public"."bookings" "b" ON (("te"."id" = "b"."event_id")))
  WHERE ("te"."event_date" < CURRENT_DATE)
  GROUP BY "c"."id", "c"."name";


ALTER VIEW "public"."training_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "careskills_name" character varying(255),
    "description" "text",
    "expiry_months" integer DEFAULT 12,
    "never_expires" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "category" character varying(100)
);


ALTER TABLE "public"."training_courses" OWNER TO "postgres";


COMMENT ON TABLE "public"."training_courses" IS 'Courses for the training matrix (Careskills). Separate from booking calendar courses.';



CREATE TABLE IF NOT EXISTS "public"."venues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "office_region" "text" DEFAULT 'Hull'::"text"
);


ALTER TABLE "public"."venues" OWNER TO "postgres";


ALTER TABLE ONLY "public"."location_courses" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."location_courses_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."sign_in_app_webhook_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."sign_in_app_webhook_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff_locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_locations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff_training_locations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_training_locations_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."staff_training_matrix" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."staff_training_matrix_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."booking_checklist_template_items"
    ADD CONSTRAINT "booking_checklist_template_items_item_name_key" UNIQUE ("item_name");



ALTER TABLE ONLY "public"."booking_checklist_template_items"
    ADD CONSTRAINT "booking_checklist_template_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_checklists"
    ADD CONSTRAINT "booking_checklists_booking_id_item_name_key" UNIQUE ("booking_id", "item_name");



ALTER TABLE ONLY "public"."booking_checklists"
    ADD CONSTRAINT "booking_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_event_id_profile_id_key" UNIQUE ("event_id", "profile_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checklist_completions"
    ADD CONSTRAINT "checklist_completions_booking_id_checklist_item_id_key" UNIQUE ("booking_id", "checklist_item_id");



ALTER TABLE ONLY "public"."checklist_completions"
    ADD CONSTRAINT "checklist_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_event_overrides"
    ADD CONSTRAINT "course_event_overrides_course_id_event_date_key" UNIQUE ("course_id", "event_date");



ALTER TABLE ONLY "public"."course_event_overrides"
    ADD CONSTRAINT "course_event_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."course_feedback"
    ADD CONSTRAINT "course_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deleted_items"
    ADD CONSTRAINT "deleted_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_logs"
    ADD CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_automation_settings"
    ADD CONSTRAINT "feedback_automation_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_email_logs"
    ADD CONSTRAINT "feedback_email_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_form_config"
    ADD CONSTRAINT "feedback_form_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feedback_settings"
    ADD CONSTRAINT "feedback_settings_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."feedback_settings"
    ADD CONSTRAINT "feedback_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_courses"
    ADD CONSTRAINT "location_courses_location_id_course_id_key" UNIQUE ("location_id", "course_id");



ALTER TABLE ONLY "public"."location_courses"
    ADD CONSTRAINT "location_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_matrix_dividers"
    ADD CONSTRAINT "location_matrix_dividers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_training_courses"
    ADD CONSTRAINT "location_training_courses_location_id_training_course_id_key" UNIQUE ("location_id", "training_course_id");



ALTER TABLE ONLY "public"."location_training_courses"
    ADD CONSTRAINT "location_training_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qualification_lead_timeline"
    ADD CONSTRAINT "qualification_lead_timeline_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qualification_leads"
    ADD CONSTRAINT "qualification_leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sign_in_app_webhook_events"
    ADD CONSTRAINT "sign_in_app_webhook_events_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."sign_in_app_webhook_events"
    ADD CONSTRAINT "sign_in_app_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_locations"
    ADD CONSTRAINT "staff_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_locations"
    ADD CONSTRAINT "staff_locations_staff_id_location_id_key" UNIQUE ("staff_id", "location_id");



ALTER TABLE ONLY "public"."staff_training_locations"
    ADD CONSTRAINT "staff_training_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_training_locations"
    ADD CONSTRAINT "staff_training_locations_staff_id_location_id_key" UNIQUE ("staff_id", "location_id");



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_staff_id_course_id_location_id_key" UNIQUE ("staff_id", "course_id", "completed_at_location_id");



ALTER TABLE ONLY "public"."ticket_updates"
    ADD CONSTRAINT "ticket_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_courses"
    ADD CONSTRAINT "training_courses_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."training_courses"
    ADD CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."venues"
    ADD CONSTRAINT "venues_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_booking_checklist_template_items_active_order" ON "public"."booking_checklist_template_items" USING "btree" ("is_active", "item_order");



CREATE INDEX "idx_booking_checklists_booking_id" ON "public"."booking_checklists" USING "btree" ("booking_id");



CREATE INDEX "idx_checklist_completions_booking_id" ON "public"."checklist_completions" USING "btree" ("booking_id");



CREATE INDEX "idx_checklist_completions_completed_by" ON "public"."checklist_completions" USING "btree" ("completed_by");



CREATE INDEX "idx_courses_category" ON "public"."courses" USING "btree" ("category");



CREATE INDEX "idx_courses_expiry_months" ON "public"."courses" USING "btree" ("expiry_months");



CREATE INDEX "idx_deleted_items_active" ON "public"."deleted_items" USING "btree" ("restored_at") WHERE ("restored_at" IS NULL);



CREATE INDEX "idx_deleted_items_deleted_at" ON "public"."deleted_items" USING "btree" ("deleted_at" DESC);



CREATE INDEX "idx_deleted_items_entity" ON "public"."deleted_items" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_email_logs_created_at" ON "public"."email_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_email_logs_status" ON "public"."email_logs" USING "btree" ("status");



CREATE INDEX "idx_feedback_email_logs_event_id" ON "public"."feedback_email_logs" USING "btree" ("event_id");



CREATE INDEX "idx_feedback_email_logs_trigger_time" ON "public"."feedback_email_logs" USING "btree" ("trigger_time");



CREATE INDEX "idx_location_courses_delivery_type" ON "public"."location_courses" USING "btree" ("delivery_type");



CREATE INDEX "idx_location_courses_location_id" ON "public"."location_courses" USING "btree" ("location_id");



CREATE INDEX "idx_location_matrix_dividers_location" ON "public"."location_matrix_dividers" USING "btree" ("location_id");



CREATE INDEX "idx_location_training_courses_course" ON "public"."location_training_courses" USING "btree" ("training_course_id");



CREATE INDEX "idx_location_training_courses_display_order" ON "public"."location_training_courses" USING "btree" ("location_id", "display_order");



CREATE INDEX "idx_location_training_courses_location" ON "public"."location_training_courses" USING "btree" ("location_id");



CREATE INDEX "idx_profiles_deleted_at" ON "public"."profiles" USING "btree" ("deleted_at");



CREATE INDEX "idx_profiles_is_deleted" ON "public"."profiles" USING "btree" ("is_deleted");



CREATE INDEX "idx_qualification_lead_timeline_lead_date" ON "public"."qualification_lead_timeline" USING "btree" ("lead_id", "event_date" DESC);



CREATE INDEX "idx_qualification_leads_enquiry_date" ON "public"."qualification_leads" USING "btree" ("enquiry_date" DESC);



CREATE INDEX "idx_qualification_leads_location_id" ON "public"."qualification_leads" USING "btree" ("location_id");



CREATE INDEX "idx_qualification_leads_stage" ON "public"."qualification_leads" USING "btree" ("stage");



CREATE INDEX "idx_staff_locations_display_order" ON "public"."staff_locations" USING "btree" ("location_id", "display_order");



CREATE INDEX "idx_staff_locations_location_id" ON "public"."staff_locations" USING "btree" ("location_id");



CREATE INDEX "idx_staff_locations_staff_id" ON "public"."staff_locations" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_training_course_id" ON "public"."staff_training_matrix" USING "btree" ("course_id");



CREATE INDEX "idx_staff_training_expiry" ON "public"."staff_training_matrix" USING "btree" ("expiry_date");



CREATE INDEX "idx_staff_training_locations_location_id" ON "public"."staff_training_locations" USING "btree" ("location_id");



CREATE INDEX "idx_staff_training_locations_staff_id" ON "public"."staff_training_locations" USING "btree" ("staff_id");



CREATE INDEX "idx_staff_training_staff_id" ON "public"."staff_training_matrix" USING "btree" ("staff_id");



CREATE INDEX "idx_training_courses_careskills_name" ON "public"."training_courses" USING "btree" ("careskills_name");



CREATE INDEX "idx_training_courses_category" ON "public"."training_courses" USING "btree" ("category");



CREATE INDEX "idx_training_courses_name" ON "public"."training_courses" USING "btree" ("name");



CREATE UNIQUE INDEX "profiles_sign_in_app_visitor_id_idx" ON "public"."profiles" USING "btree" ("sign_in_app_visitor_id") WHERE ("sign_in_app_visitor_id" IS NOT NULL);



CREATE OR REPLACE TRIGGER "qualification_leads_touch_updated_at" BEFORE UPDATE ON "public"."qualification_leads" FOR EACH ROW EXECUTE FUNCTION "public"."touch_qualification_lead_updated_at"();



CREATE OR REPLACE TRIGGER "tr_prevent_overlap" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."check_staff_time_conflict"();



CREATE OR REPLACE TRIGGER "update_feedback_form_config_updated_at" BEFORE UPDATE ON "public"."feedback_form_config" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."booking_checklists"
    ADD CONSTRAINT "booking_checklists_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."training_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_attendance_marked_by_fkey" FOREIGN KEY ("attendance_marked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_booked_by_fkey" FOREIGN KEY ("booked_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."training_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_completions"
    ADD CONSTRAINT "checklist_completions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."training_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_completions"
    ADD CONSTRAINT "checklist_completions_checklist_item_id_fkey" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."booking_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checklist_completions"
    ADD CONSTRAINT "checklist_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."course_event_overrides"
    ADD CONSTRAINT "course_event_overrides_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deleted_items"
    ADD CONSTRAINT "deleted_items_deleted_by_fkey" FOREIGN KEY ("deleted_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deleted_items"
    ADD CONSTRAINT "deleted_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deleted_items"
    ADD CONSTRAINT "deleted_items_restored_by_fkey" FOREIGN KEY ("restored_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feedback_email_logs"
    ADD CONSTRAINT "fk_event" FOREIGN KEY ("event_id") REFERENCES "public"."training_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."location_courses"
    ADD CONSTRAINT "location_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_courses"
    ADD CONSTRAINT "location_courses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_matrix_dividers"
    ADD CONSTRAINT "location_matrix_dividers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_training_courses"
    ADD CONSTRAINT "location_training_courses_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_training_courses"
    ADD CONSTRAINT "location_training_courses_training_course_id_fkey" FOREIGN KEY ("training_course_id") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qualification_lead_timeline"
    ADD CONSTRAINT "qualification_lead_timeline_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qualification_lead_timeline"
    ADD CONSTRAINT "qualification_lead_timeline_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."qualification_leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."qualification_leads"
    ADD CONSTRAINT "qualification_leads_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."qualification_leads"
    ADD CONSTRAINT "qualification_leads_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."qualification_leads"
    ADD CONSTRAINT "qualification_leads_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_locations"
    ADD CONSTRAINT "staff_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_locations"
    ADD CONSTRAINT "staff_locations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_training_locations"
    ADD CONSTRAINT "staff_training_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_training_locations"
    ADD CONSTRAINT "staff_training_locations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_booking_course_id_fkey" FOREIGN KEY ("booking_course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_completed_at_location_id_fkey" FOREIGN KEY ("completed_at_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."staff_training_matrix"
    ADD CONSTRAINT "staff_training_matrix_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."training_events"
    ADD CONSTRAINT "training_events_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id");



CREATE POLICY "Admin delete ticket_updates" ON "public"."ticket_updates" FOR DELETE USING (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "Admin profile management" ON "public"."profiles" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "Admin update ticket_updates" ON "public"."ticket_updates" FOR UPDATE USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "Admins can delete courses" ON "public"."courses" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Admins can delete locations" ON "public"."locations" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow admin writes" ON "public"."feedback_form_config" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role_tier" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role_tier" = 'admin'::"public"."user_role")))));



CREATE POLICY "Allow authenticated reads" ON "public"."course_feedback" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated reads" ON "public"."feedback_email_logs" FOR SELECT TO "authenticated";



CREATE POLICY "Allow authenticated reads" ON "public"."feedback_form_config" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated to read staff_training_locations" ON "public"."staff_training_locations" FOR SELECT USING (true);



CREATE POLICY "Allow public inserts" ON "public"."course_feedback" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);



CREATE POLICY "App admin write courses" ON "public"."courses" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write feedback_automation_settings" ON "public"."feedback_automation_settings" USING (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write feedback_settings" ON "public"."feedback_settings" USING (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write location_courses" ON "public"."location_courses" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write location_training_courses" ON "public"."location_training_courses" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write locations" ON "public"."locations" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write training_courses" ON "public"."training_courses" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App admin write venues" ON "public"."venues" USING (("public"."current_user_role_tier"() = 'admin'::"text")) WITH CHECK (("public"."current_user_role_tier"() = 'admin'::"text"));



CREATE POLICY "App authenticated read courses" ON "public"."courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read feedback_settings" ON "public"."feedback_settings" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read location_courses" ON "public"."location_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read location_training_courses" ON "public"."location_training_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read locations" ON "public"."locations" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read training_courses" ON "public"."training_courses" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App authenticated read venues" ON "public"."venues" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "App scheduler admin read booking_checklists" ON "public"."booking_checklists" FOR SELECT USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "App scheduler admin read checklist_completions" ON "public"."checklist_completions" FOR SELECT USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "App scheduler admin read email_logs" ON "public"."email_logs" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "App scheduler admin read feedback_automation_settings" ON "public"."feedback_automation_settings" FOR SELECT USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "App scheduler admin write booking_checklists" ON "public"."booking_checklists" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "App scheduler admin write checklist_completions" ON "public"."checklist_completions" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Authenticated users can read location_matrix_dividers" ON "public"."location_matrix_dividers" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Enable delete for admins" ON "public"."venues" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Enable insert for admins" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for admins" ON "public"."venues" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read for all" ON "public"."locations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read for all" ON "public"."venues" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read for all users" ON "public"."location_training_courses" FOR SELECT USING (true);



CREATE POLICY "Enable read for all users" ON "public"."training_courses" FOR SELECT USING (true);



CREATE POLICY "Enable read for service role only" ON "public"."deleted_items" FOR SELECT USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable write for service role" ON "public"."location_training_courses" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable write for service role" ON "public"."training_courses" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Enable write for service role only" ON "public"."deleted_items" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Qualification lead location visibility" ON "public"."qualification_leads" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids")))));



CREATE POLICY "Qualification lead management" ON "public"."qualification_leads" USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids"))))) WITH CHECK ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids")))));



CREATE POLICY "Qualification timeline location visibility" ON "public"."qualification_lead_timeline" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids"))))))));



CREATE POLICY "Qualification timeline management" ON "public"."qualification_lead_timeline" USING ((EXISTS ( SELECT 1
   FROM "public"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."qualification_leads" "lead"
  WHERE (("lead"."id" = "qualification_lead_timeline"."lead_id") AND (("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'manager'::"text") AND ("lead"."location_id" IN ( SELECT "public"."current_user_location_ids"() AS "current_user_location_ids"))))))));



CREATE POLICY "Scheduler booking management" ON "public"."bookings" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Scheduler event management" ON "public"."training_events" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Scheduler event override management" ON "public"."course_event_overrides" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Scheduler staff location management" ON "public"."staff_locations" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Scheduler training management" ON "public"."staff_training_matrix" USING (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"]))) WITH CHECK (("public"."current_user_role_tier"() = ANY (ARRAY['scheduler'::"text", 'admin'::"text"])));



CREATE POLICY "Schedulers and admins read booking_checklists" ON "public"."booking_checklists" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "Schedulers and admins read checklist_completions" ON "public"."checklist_completions" FOR SELECT USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "Schedulers and admins write booking_checklists" ON "public"."booking_checklists" USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "Schedulers and admins write checklist_completions" ON "public"."checklist_completions" USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "Schedulers/admins can write location_matrix_dividers" ON "public"."location_matrix_dividers" USING ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"]))) WITH CHECK ((( SELECT "profiles"."role_tier"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = ANY (ARRAY['scheduler'::"public"."user_role", 'admin'::"public"."user_role"])));



CREATE POLICY "Self service booking visibility" ON "public"."bookings" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("profile_id" = "auth"."uid"())));



CREATE POLICY "Self service event override visibility" ON "public"."course_event_overrides" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'staff'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."training_events" "te" ON (("te"."id" = "b"."event_id")))
  WHERE (("b"."profile_id" = "auth"."uid"()) AND ("te"."course_id" = "course_event_overrides"."course_id") AND ("te"."event_date" = "course_event_overrides"."event_date")))))));



CREATE POLICY "Self service event visibility" ON "public"."training_events" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR (("public"."current_user_role_tier"() = 'staff'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."event_id" = "training_events"."id") AND ("b"."profile_id" = "auth"."uid"())))))));



CREATE POLICY "Self service profile visibility" ON "public"."profiles" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("id" = "auth"."uid"())));



CREATE POLICY "Self service staff location visibility" ON "public"."staff_locations" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("staff_id" = "auth"."uid"())));



CREATE POLICY "Self service training visibility" ON "public"."staff_training_matrix" FOR SELECT USING ((("public"."current_user_role_tier"() = ANY (ARRAY['admin'::"text", 'manager'::"text", 'scheduler'::"text"])) OR ("staff_id" = "auth"."uid"())));



CREATE POLICY "Service role full access booking_checklists" ON "public"."booking_checklists" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access checklist_completions" ON "public"."checklist_completions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role full access location_matrix_dividers" ON "public"."location_matrix_dividers" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role insert email_logs" ON "public"."email_logs" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role read email_logs" ON "public"."email_logs" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Users can view allowed rows" ON "public"."booking_checklist_template_items" FOR SELECT TO "authenticated" USING (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."booking_checklist_template_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checklist_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_event_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."course_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "courses_insert" ON "public"."courses" FOR INSERT WITH CHECK (true);



CREATE POLICY "courses_select" ON "public"."courses" FOR SELECT USING (true);



CREATE POLICY "courses_update" ON "public"."courses" FOR UPDATE USING (true);



ALTER TABLE "public"."deleted_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_automation_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_email_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_form_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."feedback_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_courses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_courses_insert" ON "public"."location_courses" FOR INSERT WITH CHECK (true);



CREATE POLICY "location_courses_select" ON "public"."location_courses" FOR SELECT USING (true);



CREATE POLICY "location_courses_update" ON "public"."location_courses" FOR UPDATE USING (true);



ALTER TABLE "public"."location_matrix_dividers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_training_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qualification_lead_timeline" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."qualification_leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sign_in_app_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_training_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."staff_training_matrix" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."venues" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."calculate_expiry_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_expiry_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_expiry_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_staff_time_conflict"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_staff_time_conflict"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_staff_time_conflict"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_location_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_location_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_location_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_location_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_user_role_tier"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_user_role_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_user_role_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_user_role_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_qualification_lead_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_qualification_lead_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_qualification_lead_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_course_data"("p_course_id" "uuid", "p_updates" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_course_data"("p_course_id" "uuid", "p_updates" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_course_data"("p_course_id" "uuid", "p_updates" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


















GRANT ALL ON TABLE "public"."booking_checklist_template_items" TO "anon";
GRANT ALL ON TABLE "public"."booking_checklist_template_items" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_checklist_template_items" TO "service_role";



GRANT ALL ON TABLE "public"."booking_checklists" TO "anon";
GRANT ALL ON TABLE "public"."booking_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."training_events" TO "anon";
GRANT ALL ON TABLE "public"."training_events" TO "authenticated";
GRANT ALL ON TABLE "public"."training_events" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_view" TO "anon";
GRANT ALL ON TABLE "public"."calendar_view" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_view" TO "service_role";



GRANT ALL ON TABLE "public"."checklist_completions" TO "anon";
GRANT ALL ON TABLE "public"."checklist_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."checklist_completions" TO "service_role";



GRANT ALL ON TABLE "public"."course_event_overrides" TO "anon";
GRANT ALL ON TABLE "public"."course_event_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."course_event_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."course_feedback" TO "anon";
GRANT ALL ON TABLE "public"."course_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."course_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."deleted_items" TO "anon";
GRANT ALL ON TABLE "public"."deleted_items" TO "authenticated";
GRANT ALL ON TABLE "public"."deleted_items" TO "service_role";



GRANT ALL ON TABLE "public"."email_logs" TO "anon";
GRANT ALL ON TABLE "public"."email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_automation_settings" TO "anon";
GRANT ALL ON TABLE "public"."feedback_automation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_automation_settings" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_email_logs" TO "anon";
GRANT ALL ON TABLE "public"."feedback_email_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_email_logs" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_form_config" TO "anon";
GRANT ALL ON TABLE "public"."feedback_form_config" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_form_config" TO "service_role";



GRANT ALL ON TABLE "public"."feedback_settings" TO "anon";
GRANT ALL ON TABLE "public"."feedback_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."feedback_settings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."it_referrals_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."it_referrals_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."it_referrals_ticket_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."location_courses" TO "anon";
GRANT ALL ON TABLE "public"."location_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."location_courses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."location_courses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."location_courses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."location_courses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."location_matrix_dividers" TO "anon";
GRANT ALL ON TABLE "public"."location_matrix_dividers" TO "authenticated";
GRANT ALL ON TABLE "public"."location_matrix_dividers" TO "service_role";



GRANT ALL ON TABLE "public"."location_training_courses" TO "anon";
GRANT ALL ON TABLE "public"."location_training_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."location_training_courses" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."qualification_lead_timeline" TO "anon";
GRANT ALL ON TABLE "public"."qualification_lead_timeline" TO "authenticated";
GRANT ALL ON TABLE "public"."qualification_lead_timeline" TO "service_role";



GRANT ALL ON TABLE "public"."qualification_leads" TO "anon";
GRANT ALL ON TABLE "public"."qualification_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."qualification_leads" TO "service_role";



GRANT ALL ON TABLE "public"."sign_in_app_webhook_events" TO "anon";
GRANT ALL ON TABLE "public"."sign_in_app_webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sign_in_app_webhook_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sign_in_app_webhook_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sign_in_app_webhook_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sign_in_app_webhook_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_locations" TO "anon";
GRANT ALL ON TABLE "public"."staff_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_training_locations" TO "anon";
GRANT ALL ON TABLE "public"."staff_training_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_training_locations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_training_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_training_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_training_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_training_matrix" TO "anon";
GRANT ALL ON TABLE "public"."staff_training_matrix" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_training_matrix" TO "service_role";



GRANT ALL ON SEQUENCE "public"."staff_training_matrix_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."staff_training_matrix_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."staff_training_matrix_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_training_stats" TO "anon";
GRANT ALL ON TABLE "public"."staff_training_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_training_stats" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_updates" TO "anon";
GRANT ALL ON TABLE "public"."ticket_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_updates" TO "service_role";



GRANT ALL ON TABLE "public"."training_analytics" TO "anon";
GRANT ALL ON TABLE "public"."training_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."training_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."training_courses" TO "anon";
GRANT ALL ON TABLE "public"."training_courses" TO "authenticated";
GRANT ALL ON TABLE "public"."training_courses" TO "service_role";



GRANT ALL ON TABLE "public"."venues" TO "anon";
GRANT ALL ON TABLE "public"."venues" TO "authenticated";
GRANT ALL ON TABLE "public"."venues" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































