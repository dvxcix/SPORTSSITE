-- Keep every in-app notification, but only invoke Vercel delivery workers
-- when the recipient can actually receive that channel. Previously every
-- notification called both routes; almost 400k email calls in seven days
-- were spent discovering that email was disabled.
create or replace function public.notify_email_on_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  trigger_secret text;
  settings jsonb;
  setting_key text;
begin
  setting_key := case new.type
    when 'follow' then 'new_follower'
    when 'reaction' then 'post_reaction'
    when 'comment' then 'post_comment'
    when 'mention' then 'mention'
    when 'pick_result' then 'pick_result'
    when 'message' then 'dm'
    when 'subscription' then 'subscription'
    when 'repost' then 'repost'
    when 'group_invite' then 'group_invite'
    when 'new_pick' then 'new_pick'
    when 'lineup_confirmed' then 'lineup_confirmed'
    else null
  end;

  select u.notification_settings into settings
  from public.users u
  where u.id = new.user_id;

  if setting_key is null
     or coalesce((settings ->> (setting_key || '_email'))::boolean, false) is not true then
    return new;
  end if;

  select decrypted_secret into trigger_secret
  from vault.decrypted_secrets
  where name = 'push_trigger_secret'
  limit 1;

  perform net.http_post(
    url := 'https://www.slipsurge.com/api/email/send-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(trigger_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;

create or replace function public.notify_push_on_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  trigger_secret text;
  settings jsonb;
  setting_key text;
begin
  setting_key := case new.type
    when 'follow' then 'new_follower'
    when 'reaction' then 'post_reaction'
    when 'comment' then 'post_comment'
    when 'mention' then 'mention'
    when 'pick_result' then 'pick_result'
    when 'message' then 'dm'
    when 'subscription' then 'subscription'
    when 'repost' then 'repost'
    when 'group_invite' then 'group_invite'
    when 'new_pick' then 'new_pick'
    when 'lineup_confirmed' then 'lineup_confirmed'
    else null
  end;

  select u.notification_settings into settings
  from public.users u
  where u.id = new.user_id;

  if setting_key is not null
     and coalesce((settings ->> setting_key)::boolean, true) is false then
    return new;
  end if;
  if not exists (
    select 1 from public.push_subscriptions ps where ps.user_id = new.user_id
  ) then
    return new;
  end if;

  select decrypted_secret into trigger_secret
  from vault.decrypted_secrets
  where name = 'push_trigger_secret'
  limit 1;

  perform net.http_post(
    url := 'https://www.slipsurge.com/api/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(trigger_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;

revoke all on function public.notify_email_on_insert() from public, anon, authenticated;
revoke all on function public.notify_push_on_insert() from public, anon, authenticated;
