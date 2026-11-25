-- Durable idempotency for the native composer. The existing web transaction
-- and the grading rows remain the single writer for both entry points.
create table public.native_tracked_pick_requests (
  user_id uuid not null references public.users(id) on delete cascade,
  draft_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  post_id uuid references public.posts(id) on delete set null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, draft_id)
);

create index native_tracked_pick_requests_post_idx on public.native_tracked_pick_requests (post_id) where post_id is not null;
alter table public.native_tracked_pick_requests enable row level security;
revoke all on public.native_tracked_pick_requests from public, anon, authenticated;
grant select, insert on public.native_tracked_pick_requests to service_role;

create function public.create_native_tracked_pick_post(p_user_id uuid, p_draft_id uuid, p_fingerprint text, p_post jsonb, p_picks jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_saved public.native_tracked_pick_requests; v_result jsonb;
begin
  if p_user_id is null or p_draft_id is null or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$'
    or (p_post->>'author_id')::uuid is distinct from p_user_id then
    raise exception 'Invalid native pick draft';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text || ':' || p_draft_id::text, 0));
  select * into v_saved from public.native_tracked_pick_requests where user_id=p_user_id and draft_id=p_draft_id;
  if found then
    if v_saved.fingerprint is distinct from p_fingerprint or v_saved.post_id is null then
      return jsonb_build_object('conflict',true);
    end if;
    return jsonb_build_object('created',false,'post',v_saved.result);
  end if;
  v_result := public.create_tracked_pick_post(p_post,p_picks);
  if coalesce(v_result->>'picksTracked','false') <> 'true' or v_result->>'id' is null then
    raise exception 'Native pick post did not commit';
  end if;
  insert into public.native_tracked_pick_requests(user_id,draft_id,fingerprint,post_id,result)
    values(p_user_id,p_draft_id,p_fingerprint,(v_result->>'id')::uuid,v_result);
  return jsonb_build_object('created',true,'post',v_result);
end;
$$;
revoke all on function public.create_native_tracked_pick_post(uuid,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_native_tracked_pick_post(uuid,uuid,text,jsonb,jsonb) to service_role;
