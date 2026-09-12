drop policy if exists "Can unfollow" on public.follows;
create policy "Can unfollow"
on public.follows for delete to authenticated
using (
  follower_id = (select auth.uid())
  or (
    following_id = (select auth.uid())
    and exists (
      select 1 from public.blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = follows.follower_id
    )
  )
);

alter function public.set_account_block(uuid, boolean)
  security invoker;
