-- Approved scoped recovery. Execute only after verified app deployment and live preflight,
-- a verified and deployed matching application allowlist change, fresh live
-- preflight, isolated transactional tests, and an independent review.
-- Creates no new collector and changes no normal/period budgets.
BEGIN;
-- Removed review-only blocker after user approval; all preflight gates remain.
-- Owner approved this scope explicitly in chat.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
SELECT set_config('nba.recovery_approval_note','Owner explicitly approved in chat: Yes.. wtf.. YES YES YES. Scope Oct 30 public counts, three additional sessions, expires 7pm ET.',true);
DO $preflight$
DECLARE
  expected_project constant text := '648484cb-1b8f-468d-a88d-8a0555da458a';
  f regprocedure := to_regprocedure('public.apply_nba_browser_spend_budget(uuid,text,integer,integer,integer,integer,integer,integer,numeric,bigint,timestamptz,integer,integer,text,bigint[])');
  constraints_digest text;
BEGIN
  IF clock_timestamp() >= '2026-10-30 23:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Recovery expired at first-game tip';
  END IF;
  IF current_setting('nba.recovery_approval_note',true) IS NULL
    OR current_setting('nba.recovery_approval_note',true)='REVIEW_ONLY_NOT_AUTHORIZED'
    OR length(btrim(current_setting('nba.recovery_approval_note',true)))<40 THEN
    RAISE EXCEPTION 'Exact task-specific owner authorization is required';
  END IF;
  IF f IS NULL OR md5(pg_get_functiondef(f)) <> 'ad77f9d78021ee432413281b59d366bf' THEN
    RAISE EXCEPTION 'Live spend-budget function changed; stop and re-review';
  END IF;
  SELECT md5(string_agg(conname||'='||pg_get_constraintdef(oid),E'\n' ORDER BY conname))
    INTO constraints_digest FROM pg_constraint
    WHERE conrelid='public.nba_browser_task_allowances'::regclass;
  IF constraints_digest IS DISTINCT FROM 'fcb589b0fbd2b65b22bd808e4135f1fa' THEN
    RAISE EXCEPTION 'Allowance schema changed; stop and re-review';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.nba_browser_task_allowances'::regclass AND relrowsecurity)
    OR NOT has_table_privilege('service_role','public.nba_browser_task_allowances','SELECT')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','INSERT')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','UPDATE')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','DELETE')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','TRUNCATE')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','REFERENCES')
    OR has_table_privilege('service_role','public.nba_browser_task_allowances','TRIGGER')
    OR has_table_privilege('anon','public.nba_browser_task_allowances','SELECT')
    OR has_table_privilege('authenticated','public.nba_browser_task_allowances','SELECT')
    OR EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated')) x(role_name),
         (VALUES ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege_name)
         WHERE has_table_privilege(x.role_name,'public.nba_browser_task_allowances',p.privilege_name))
    OR EXISTS (SELECT 1 FROM (VALUES ('anon'),('authenticated'),('service_role')) x(role_name),
         (VALUES ('INSERT'),('UPDATE'),('REFERENCES')) p(privilege_name)
         WHERE has_any_column_privilege(x.role_name,'public.nba_browser_task_allowances',p.privilege_name))
    OR has_any_column_privilege('anon','public.nba_browser_task_allowances','SELECT')
    OR has_any_column_privilege('authenticated','public.nba_browser_task_allowances','SELECT')
    OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nba_browser_task_allowances')
    OR EXISTS (SELECT 1 FROM pg_class c, LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
         WHERE c.oid='public.nba_browser_task_allowances'::regclass AND a.grantee=0)
    OR NOT has_function_privilege('service_role',f,'EXECUTE')
    OR has_function_privilege('anon',f,'EXECUTE')
    OR has_function_privilege('authenticated',f,'EXECUTE')
    OR EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE p.oid=f AND a.grantee=0) THEN
    RAISE EXCEPTION 'Unexpected allowance permissions; stop and re-review';
  END IF;
  IF (SELECT count(*) FROM public.nba_browser_task_allowances) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_task_allowances
      WHERE allowance_key='nba-public-count-recovery-2026-10-28'
      AND project_id=expected_project AND allowance_day='2026-10-28'::date
      AND expires_at='2026-10-29 00:00:00+00'::timestamptz
      AND game_ids=ARRAY[21717975,21717976,21717977,21717978,21717979,21717980,21717981,21717982,21717983,21717984,21717985,21717986]::bigint[]
      AND daily_cents=1200 AND daily_sessions=11 AND daily_minutes=55)
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_task_allowances
      WHERE allowance_key='nba-public-count-recovery-2026-10-29'
      AND project_id=expected_project AND allowance_day='2026-10-29'::date
      AND expires_at='2026-10-30 00:00:00+00'::timestamptz
      AND game_ids=ARRAY[21717987,21717988,21717989]::bigint[]
      AND daily_cents=450 AND daily_sessions=7 AND daily_minutes=35) THEN
    RAISE EXCEPTION 'Historical allowances changed; do not proceed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.nba_browser_budget_projects WHERE project_id=expected_project AND reset_day=18)
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_budget_counters WHERE project_id=expected_project AND kind='day'
      AND starts_on='2026-10-30'::date AND sessions=5 AND reserved_minutes=25)
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_budget_counters WHERE project_id=expected_project AND kind='period'
      AND starts_on='2026-10-18'::date AND sessions<=95 AND reserved_minutes<=475)
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_spend_windows WHERE project_id=expected_project AND kind='day'
      AND starts_on='2026-10-30'::date AND cost_floor_cents BETWEEN 306 AND 347)
    OR NOT EXISTS (SELECT 1 FROM public.nba_browser_spend_windows WHERE project_id=expected_project AND kind='period'
      AND starts_on='2026-10-18'::date AND cost_floor_cents<=4847) THEN
    RAISE EXCEPTION 'Budget changed or insufficient room for three reservations';
  END IF;

END $preflight$;

-- Replace all seven date-specific checks with ONE complete old-or-new tuple.
-- Keep project/FK, primary key and UNIQUE(project_id,allowance_day) untouched.
ALTER TABLE public.nba_browser_task_allowances
  DROP CONSTRAINT nba_browser_task_allowances_reviewed_scopes_check;

ALTER TABLE public.nba_browser_task_allowances
  ADD CONSTRAINT nba_browser_task_allowances_reviewed_scopes_check CHECK (
    starts_at < expires_at AND (
      (allowance_key='nba-public-count-recovery-2026-10-28'
       AND allowance_day='2026-10-28'::date
       AND expires_at='2026-10-29 00:00:00+00'::timestamptz
       AND game_ids=ARRAY[21717975,21717976,21717977,21717978,21717979,21717980,21717981,21717982,21717983,21717984,21717985,21717986]::bigint[]
       AND daily_cents=1200 AND daily_sessions=11 AND daily_minutes=55)
      OR
      (allowance_key='nba-public-count-recovery-2026-10-29'
       AND allowance_day='2026-10-29'::date
       AND expires_at='2026-10-30 00:00:00+00'::timestamptz
       AND game_ids=ARRAY[21717987,21717988,21717989]::bigint[]
       AND daily_cents=450 AND daily_sessions=7 AND daily_minutes=35)
      OR
      (allowance_key='nba-public-count-recovery-2026-10-30'
       AND allowance_day='2026-10-30'::date
       AND expires_at='2026-10-30 23:00:00+00'::timestamptz
       AND game_ids=ARRAY[21717990,21717992,21717993,21717994,21717995,21717996,21717997,21717998,21717999,21718000]::bigint[]
       AND daily_cents=500 AND daily_sessions=8 AND daily_minutes=40)
    )
  );

INSERT INTO public.nba_browser_task_allowances
  (allowance_key,project_id,allowance_day,starts_at,expires_at,game_ids,
   daily_cents,daily_sessions,daily_minutes,authorization_note)
VALUES ('nba-public-count-recovery-2026-10-30','648484cb-1b8f-468d-a88d-8a0555da458a',
  '2026-10-30'::date,clock_timestamp(),'2026-10-30 23:00:00+00'::timestamptz,
  ARRAY[21717990,21717992,21717993,21717994,21717995,21717996,21717997,21717998,21717999,21718000]::bigint[],500,8,40,
  current_setting('nba.recovery_approval_note',true));

-- Record actual scope in migration history and verify after application.
COMMIT;
