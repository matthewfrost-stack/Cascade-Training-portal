-- Security health check. Run in the Supabase SQL Editor at any time.
-- Reads settings only (no staff data). Every query should return NO ROWS
-- when the database is locked down. Run each query on its own, because the
-- SQL Editor only shows the result of the last statement.

-- 1. Tables with row-level security switched OFF.
--    Any table listed here is fully readable/writable with the public key.
select n.nspname as schema, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('dev', 'public')
  and not c.relrowsecurity
order by 1, 2;

-- 2. Policies that let anyone in without logging in:
--    always-true conditions that apply to the anon role (directly or via PUBLIC).
select schemaname, tablename, policyname, cmd, roles,
       qual as using_clause, with_check
from pg_policies
where schemaname in ('dev', 'public')
  and (roles && array['anon', 'public']::name[])
  and (
        coalesce(trim(qual), '') in ('true', '')
    and coalesce(trim(with_check), '') in ('true', '')
  )
order by 1, 2, 3;

-- 3. Views that bypass RLS (run as their owner instead of the caller).
select n.nspname as schema, c.relname as view_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
  and n.nspname in ('dev', 'public')
  and not coalesce(
        (select bool_or(opt = 'security_invoker=true' or opt = 'security_invoker=on')
         from unnest(c.reloptions) opt), false)
order by 1, 2;

-- 4. SECURITY DEFINER functions callable by anon (run with owner rights).
--    Review each: helpers like current_user_role_tier() are expected; anything
--    that writes data or returns staff records should not be callable by anon.
select n.nspname as schema, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('dev', 'public')
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by 1, 2;
