-- The reconciliation cursor is internal scheduler state. RLS already denies
-- client access, but revoke inherited table grants as a second boundary.
revoke all on table public.integration_reconcile_state from anon, authenticated;
grant all on table public.integration_reconcile_state to service_role;
