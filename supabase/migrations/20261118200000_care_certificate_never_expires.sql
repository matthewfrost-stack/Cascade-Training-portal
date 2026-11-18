-- Care Certificate never expires (on every home's matrix).
--
-- Does exactly what the "Never expires" option on a matrix course header does:
--   * training_courses: never_expires = true, expiry_months = 9999
--   * staff_training_matrix: expiry_date cleared on that course's completed records
-- Matches every course named "Care Certificate…" except the
-- "Care Certificate Assessor Tutorial". Courses are shared by all homes, so
-- this covers every matrix. The matrix history records the cleared dates.
--
-- Applied to both live (public) and dev. Safe to run more than once.
-- The last query lists the courses it changed.
--
-- ROLLBACK: set the course back to 12 months with the "expiry" header on the
-- matrix (it recalculates every expiry date from the completion dates).

DO $$
DECLARE
  s text;
BEGIN
  FOREACH s IN ARRAY ARRAY['public', 'dev'] LOOP
    IF to_regclass(s || '.training_courses') IS NULL THEN CONTINUE; END IF;

    EXECUTE format($f$
      UPDATE %I.training_courses
      SET never_expires = true, expiry_months = 9999
      WHERE name ILIKE 'care certificate%%' AND name NOT ILIKE '%%assessor%%'$f$, s);

    EXECUTE format($f$
      UPDATE %I.staff_training_matrix
      SET expiry_date = NULL
      WHERE expiry_date IS NOT NULL
        AND completion_date IS NOT NULL
        AND course_id IN (
          SELECT id FROM %I.training_courses
          WHERE name ILIKE 'care certificate%%' AND name NOT ILIKE '%%assessor%%'
        )$f$, s, s);
  END LOOP;
END $$;

SELECT 'live' AS part, name, never_expires, expiry_months FROM public.training_courses
WHERE name ILIKE 'care certificate%' AND name NOT ILIKE '%assessor%'
UNION ALL
SELECT 'dev', name, never_expires, expiry_months FROM dev.training_courses
WHERE name ILIKE 'care certificate%' AND name NOT ILIKE '%assessor%';
