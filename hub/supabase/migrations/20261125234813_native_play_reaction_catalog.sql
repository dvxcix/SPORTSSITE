-- Keep the legacy reactions and match the standard catalog served to native clients.
alter table public.play_reactions
  drop constraint play_reactions_emoji_check,
  add constraint play_reactions_emoji_check check (
    emoji = any(array[
        '🔥', '😂', '❤️', '💯', '👀', '👏', '💀', '😱', '😭', '🤔',
        '🫡', '🤯', '🤣', '😏', '😅', '👍', '👎', '🙏', '💪', '👉',
        '👈', '👌', '✊', '🤝', '👋', '🤞', '🙌', '⚾', '🏈', '🏀',
        '🏒', '⚽', '🥊', '🏆', '🥇', '🏟️', '🎯', '⏱️', '💰', '💵',
        '📈', '📉', '🎲', '🎰', '💎', '🚀', '🏦', '👑', '🔒', '🔓',
        '😀', '😁', '😉', '😎', '😡', '😕', '😐', '😴', '🤢', '🥳',
        '😍', '🤪', '✅', '❌', '⚠️', '❓', '❗', '⭐', '✨', '💥',
        '⚡', '⬆️', '⬇️', '🚨', '😤'
    ]::text[]) or emoji ~ '^:[a-z0-9_]{2,30}:$'
  );

create function public.check_play_reaction_custom_emoji() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if left(new.emoji, 1) = ':' and not exists (
    select 1 from public.custom_emojis
    where code = substring(new.emoji from 2 for char_length(new.emoji) - 2)
  ) then
    raise exception using errcode = '22023', message = 'Unknown custom emoji';
  end if;
  return new;
end;
$$;

create trigger play_reaction_custom_emoji
  before insert or update of emoji on public.play_reactions
  for each row execute function public.check_play_reaction_custom_emoji();

-- Explicit desired state over the existing single-reaction constraint. Keep
-- owner-only writes under the existing row-level policies.
create function public.set_native_play_reaction(
  p_game text,
  p_play text,
  p_emoji text,
  p_enabled boolean
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Sign in to react';
  end if;
  if p_game is null or p_game !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'
     or p_play is null or p_play !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$'
     or p_emoji is null or char_length(p_emoji) not between 1 and 32 or p_enabled is null then
    raise exception using errcode = '22023', message = 'Invalid reaction';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    actor::text || '/' || p_game || '/' || p_play, 0));
  delete from public.play_reactions
    where game_id = p_game and play_id = p_play and user_id = actor
      and (case when p_enabled then emoji <> p_emoji else emoji = p_emoji end);

  if p_enabled then
    insert into public.play_reactions (game_id, play_id, user_id, emoji)
      values (p_game, p_play, actor, p_emoji)
      on conflict (game_id, play_id, user_id) do nothing;
  end if;
  return true;
end;
$$;

revoke execute on function public.set_native_play_reaction(text, text, text, boolean) from public, anon;
grant execute on function public.set_native_play_reaction(text, text, text, boolean) to authenticated;
