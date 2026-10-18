begin;
set local lock_timeout='3s';
set local statement_timeout='60s';

create table public.daily_slate_alert_dispatches (
  slate_date date primary key,
  retry_id uuid references public.operational_retry_queue(id) on delete set null,
  queued_at timestamptz not null default now()
);
alter table public.daily_slate_alert_dispatches enable row level security;
revoke all on public.daily_slate_alert_dispatches from public,anon,authenticated;
grant all on public.daily_slate_alert_dispatches to service_role;

-- Claim a date and enqueue delivery atomically. Keep the date even after queue
-- retention removes the finished item, so a later invocation cannot resend it.
create function public.queue_daily_slate_alert(p_date date,p_channel_id text,p_payload jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare claimed date; queued_id uuid;
begin
  if p_date is null or p_date<>(now() at time zone 'America/New_York')::date
    or p_channel_id is null or p_channel_id !~ '^[0-9]{5,30}$'
    or jsonb_typeof(p_payload->'embeds') is distinct from 'array'
  then raise exception using errcode='22023',message='Invalid daily slate dispatch'; end if;
  insert into public.daily_slate_alert_dispatches(slate_date) values(p_date)
    on conflict do nothing returning slate_date into claimed;
  if claimed is null then return false; end if;
  insert into public.operational_retry_queue(provider,operation,payload,status,next_attempt_at,dedupe_key)
  values('discord','post_channel_message',jsonb_build_object('channelId',p_channel_id,
    'payload',p_payload||jsonb_build_object('nonce','slate-'||p_date::text,'enforce_nonce',true)),
    'pending',now(),'daily-slate:'||p_date::text) returning id into queued_id;
  update public.daily_slate_alert_dispatches set retry_id=queued_id where slate_date=p_date;
  return true;
end;
$$;
revoke all on function public.queue_daily_slate_alert(date,text,jsonb) from public,anon,authenticated;
grant execute on function public.queue_daily_slate_alert(date,text,jsonb) to service_role;
commit;
