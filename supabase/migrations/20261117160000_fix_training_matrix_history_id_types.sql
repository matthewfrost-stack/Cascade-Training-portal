-- FIX for 20261117150000_add_training_matrix_history.sql
--
-- staff_training_matrix.id is a number (bigserial), but the history table
-- stored it as a uuid, so every matrix save failed with:
--   column "matrix_id" is of type uuid but expression is of type bigint
-- This stores all ids in the history as text (works for any id type) and
-- replaces the trigger function to match. Safe to run more than once.
-- Applied to both the live (public) and dev schemas.

ALTER TABLE public.staff_training_matrix_history
  ALTER COLUMN matrix_id TYPE text USING matrix_id::text,
  ALTER COLUMN staff_id TYPE text USING staff_id::text,
  ALTER COLUMN course_id TYPE text USING course_id::text,
  ALTER COLUMN location_id TYPE text USING location_id::text,
  ALTER COLUMN old_course_id TYPE text USING old_course_id::text,
  ALTER COLUMN old_location_id TYPE text USING old_location_id::text;

ALTER TABLE dev.staff_training_matrix_history
  ALTER COLUMN matrix_id TYPE text USING matrix_id::text,
  ALTER COLUMN staff_id TYPE text USING staff_id::text,
  ALTER COLUMN course_id TYPE text USING course_id::text,
  ALTER COLUMN location_id TYPE text USING location_id::text,
  ALTER COLUMN old_course_id TYPE text USING old_course_id::text,
  ALTER COLUMN old_location_id TYPE text USING old_location_id::text;

CREATE OR REPLACE FUNCTION public.log_staff_training_matrix_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hdrs json;
  claims json;
  is_service boolean := false;
  src text;
  actor uuid;
  act text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.completion_date IS NOT DISTINCT FROM OLD.completion_date
     AND NEW.expiry_date IS NOT DISTINCT FROM OLD.expiry_date
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.course_id IS NOT DISTINCT FROM OLD.course_id
     AND NEW.completed_at_location_id IS NOT DISTINCT FROM OLD.completed_at_location_id THEN
    RETURN NULL; -- nothing that matters changed
  END IF;

  BEGIN
    hdrs := nullif(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN hdrs := NULL;
  END;
  BEGIN
    claims := nullif(current_setting('request.jwt.claims', true), '')::json;
  EXCEPTION WHEN others THEN claims := NULL;
  END;
  is_service := coalesce(claims ->> 'role', '') = 'service_role';

  BEGIN
    actor := nullif(claims ->> 'sub', '')::uuid;
  EXCEPTION WHEN others THEN actor := NULL;
  END;

  IF is_service THEN
    src := nullif(left(regexp_replace(coalesce(hdrs ->> 'x-change-source', ''), '[^a-z_]', '', 'g'), 40), '');
    BEGIN
      actor := coalesce(actor, nullif(hdrs ->> 'x-changed-by', '')::uuid);
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  src := coalesce(src, CASE WHEN actor IS NOT NULL AND NOT is_service THEN 'manual' ELSE 'system' END);

  act := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'updated' ELSE 'removed' END;

  IF TG_OP = 'DELETE' THEN
    EXECUTE format(
      'INSERT INTO %I.staff_training_matrix_history
         (matrix_id, staff_id, course_id, location_id, action,
          old_completion_date, old_expiry_date, old_status, source, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', TG_TABLE_SCHEMA)
    USING OLD.id::text, OLD.staff_id::text, OLD.course_id::text, OLD.completed_at_location_id::text, act,
          OLD.completion_date, OLD.expiry_date, OLD.status, src, actor;
  ELSIF TG_OP = 'INSERT' THEN
    EXECUTE format(
      'INSERT INTO %I.staff_training_matrix_history
         (matrix_id, staff_id, course_id, location_id, action,
          new_completion_date, new_expiry_date, new_status, source, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', TG_TABLE_SCHEMA)
    USING NEW.id::text, NEW.staff_id::text, NEW.course_id::text, NEW.completed_at_location_id::text, act,
          NEW.completion_date, NEW.expiry_date, NEW.status, src, actor;
  ELSE
    EXECUTE format(
      'INSERT INTO %I.staff_training_matrix_history
         (matrix_id, staff_id, course_id, location_id, action,
          old_completion_date, new_completion_date, old_expiry_date, new_expiry_date,
          old_status, new_status, old_course_id, old_location_id, source, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)', TG_TABLE_SCHEMA)
    USING NEW.id::text, NEW.staff_id::text, NEW.course_id::text, NEW.completed_at_location_id::text, act,
          OLD.completion_date, NEW.completion_date, OLD.expiry_date, NEW.expiry_date,
          OLD.status, NEW.status,
          CASE WHEN OLD.course_id IS DISTINCT FROM NEW.course_id THEN OLD.course_id::text END,
          CASE WHEN OLD.completed_at_location_id IS DISTINCT FROM NEW.completed_at_location_id THEN OLD.completed_at_location_id::text END,
          src, actor;
  END IF;

  RETURN NULL;
END;
$$;

-- Triggers fire without the caller needing EXECUTE; stop direct calls.
REVOKE EXECUTE ON FUNCTION public.log_staff_training_matrix_change() FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
