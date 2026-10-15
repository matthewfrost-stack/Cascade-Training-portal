-- Copy a snapshot of production data (public) into the dev schema.
-- Run AFTER create-dev-schema.sql and fix-dev-schema-permissions.sql. Safe to re-run:
-- rows whose primary key already exists in dev are skipped, not overwritten.
--
-- Tables are copied in repeated passes so parents land before children without
-- hand-maintaining an order: a table that hits a foreign key violation is retried
-- on the next pass, once the table it references has been filled.

DO $$
DECLARE
  pending text[];
  remaining text[];
  t text;
  cols text;
  n bigint;
BEGIN
  SELECT array_agg(d.table_name::text)
  INTO pending
  FROM information_schema.tables d
  JOIN information_schema.tables p
    ON p.table_schema = 'public' AND p.table_name = d.table_name AND p.table_type = 'BASE TABLE'
  WHERE d.table_schema = 'dev' AND d.table_type = 'BASE TABLE';

  LOOP
    remaining := '{}';

    FOREACH t IN ARRAY pending LOOP
      -- Only columns present in both schemas, so prod columns added since dev was created don't break the copy.
      SELECT string_agg(quote_ident(dc.column_name), ', ' ORDER BY dc.ordinal_position)
      INTO cols
      FROM information_schema.columns dc
      JOIN information_schema.columns pc
        ON pc.table_schema = 'public' AND pc.table_name = dc.table_name AND pc.column_name = dc.column_name
      WHERE dc.table_schema = 'dev' AND dc.table_name = t AND dc.is_generated = 'NEVER';

      BEGIN
        EXECUTE format(
          'INSERT INTO dev.%1$I (%2$s) SELECT %2$s FROM public.%1$I ON CONFLICT DO NOTHING',
          t, cols
        );
        GET DIAGNOSTICS n = ROW_COUNT;
        RAISE NOTICE 'Copied % rows into dev.%', n, t;
      EXCEPTION WHEN foreign_key_violation THEN
        remaining := remaining || t;
      END;
    END LOOP;

    EXIT WHEN cardinality(remaining) = 0;

    IF cardinality(remaining) = cardinality(pending) THEN
      RAISE WARNING 'Could not copy (foreign key violations): %', remaining;
      EXIT;
    END IF;

    pending := remaining;
  END LOOP;
END $$;

-- Row counts side by side, to confirm the copy.
SELECT d.table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', d.table_name), false, true, '')))[1]::text::bigint AS public_rows,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM dev.%I', d.table_name), false, true, '')))[1]::text::bigint AS dev_rows
FROM information_schema.tables d
JOIN information_schema.tables p
  ON p.table_schema = 'public' AND p.table_name = d.table_name AND p.table_type = 'BASE TABLE'
WHERE d.table_schema = 'dev' AND d.table_type = 'BASE TABLE'
ORDER BY d.table_name;
