-- Training matrix history (audit trail) for CQC / Ofsted.
--
-- Every change to a matrix record's completion date, expiry date, status,
-- course or home is written to staff_training_matrix_history by a database
-- trigger, so nothing can skip it: matrix edits, bulk edits, CSV uploads,
-- Atlas imports and syncs, new-starter defaults and removals.
--
-- Who and how:
--   - Changes made in the browser (the matrix itself) record the signed-in
--     user (auth.uid()) with source 'manual'.
--   - Server routes use the service key and send two request headers,
--     x-change-source (e.g. 'atlas_sync') and x-changed-by (user id). These
--     are trusted ONLY for service-key requests; a browser cannot fake them.
--   - Anything else is recorded with source 'system'.
--
-- Rows that are rewritten with identical values are not logged.
-- History is append-only: no one can edit or delete it through the API.
-- Applied to both the live (public) and dev schemas.
--
-- ROLLBACK (only if something breaks; this also deletes the history):
--   DROP TRIGGER IF EXISTS log_staff_training_matrix_change ON public.staff_training_matrix;
--   DROP TRIGGER IF EXISTS log_staff_training_matrix_change ON dev.staff_training_matrix;
--   DROP FUNCTION IF EXISTS public.log_staff_training_matrix_change();
--   DROP TABLE IF EXISTS public.staff_training_matrix_history;
--   DROP TABLE IF EXISTS dev.staff_training_matrix_history;

-- ---------- history tables ----------
CREATE TABLE IF NOT EXISTS public.staff_training_matrix_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id text,                 -- matrix row id, kept even if the row is deleted (ids stored as text: any id type works)
  staff_id text,
  course_id text,
  location_id text,
  action text NOT NULL,           -- 'created' | 'updated' | 'removed'
  old_completion_date date,
  new_completion_date date,
  old_expiry_date date,
  new_expiry_date date,
  old_status text,
  new_status text,
  old_course_id text,
  old_location_id text,
  source text NOT NULL,           -- 'manual', 'atlas_sync', 'csv_import', ...
  changed_by uuid,                -- profile id, when known
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS staff_training_matrix_history_cell_idx
  ON public.staff_training_matrix_history (staff_id, location_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS staff_training_matrix_history_matrix_idx
  ON public.staff_training_matrix_history (matrix_id);

CREATE TABLE IF NOT EXISTS dev.staff_training_matrix_history (LIKE public.staff_training_matrix_history INCLUDING ALL);

-- Read-only for admins through the API; the app reads it with the service key
-- and applies location access itself. No insert/update/delete policies.
ALTER TABLE public.staff_training_matrix_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE dev.staff_training_matrix_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read matrix history" ON public.staff_training_matrix_history;
CREATE POLICY "Admins read matrix history" ON public.staff_training_matrix_history
  FOR SELECT TO authenticated USING (public.current_user_role_tier() = 'admin');
DROP POLICY IF EXISTS "Admins read matrix history" ON dev.staff_training_matrix_history;
CREATE POLICY "Admins read matrix history" ON dev.staff_training_matrix_history
  FOR SELECT TO authenticated USING (public.current_user_role_tier() = 'admin');
GRANT SELECT ON public.staff_training_matrix_history TO authenticated;
GRANT SELECT ON dev.staff_training_matrix_history TO authenticated;
GRANT ALL ON public.staff_training_matrix_history TO service_role;
GRANT ALL ON dev.staff_training_matrix_history TO service_role;

-- ---------- trigger ----------
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

DROP TRIGGER IF EXISTS log_staff_training_matrix_change ON public.staff_training_matrix;
CREATE TRIGGER log_staff_training_matrix_change
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_training_matrix
  FOR EACH ROW EXECUTE FUNCTION public.log_staff_training_matrix_change();

DROP TRIGGER IF EXISTS log_staff_training_matrix_change ON dev.staff_training_matrix;
CREATE TRIGGER log_staff_training_matrix_change
  AFTER INSERT OR UPDATE OR DELETE ON dev.staff_training_matrix
  FOR EACH ROW EXECUTE FUNCTION public.log_staff_training_matrix_change();

NOTIFY pgrst, 'reload schema';
