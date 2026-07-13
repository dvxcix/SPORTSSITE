import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'follow' | 'reaction' | 'comment' | 'mention' | 'pick_result' | 'subscription' | 'message' | 'repost' | 'group_invite' | 'new_pick'

// Maps each notification type to its toggle key in users.notification_settings
// (see NotificationSettingsForm). Push uses this key directly (e.g.
// "new_follower"); email uses the same key with an "_email" suffix (e.g.
// "new_follower_email"). Exported so the push/email delivery routes — not
// notify() itself — can each independently decide whether to actually
// deliver on their channel.
export const SETTINGS_KEY_BY_TYPE: Record<NotificationType, string> = {
  follow: 'new_follower',
  reaction: 'post_reaction',
  comment: 'post_comment',
  mention: 'mention',
  pick_result: 'pick_result',
  message: 'dm',
  subscription: 'subscription',
  repost: 'repost',
  group_invite: 'group_invite',
  new_pick: 'new_pick',
}

// Thin wrapper around inserting into `notifications` — used from client
// components (follow/like/comment) where the actor IS the current user.
// The notifications page/TopBar dropdown render `{actor.display_name}
// {message}`, so `message` should read as the tail of that sentence (e.g.
// "started following you"), not a full sentence on its own.
//
// Always inserts — the in-app notification (bell/list) is the user's
// activity history and isn't itself a per-type preference. Push and email
// are separate delivery *channels* layered on top of that same row (see
// notifications_push_trigger / notifications_email_trigger and the
// /api/push/send, /api/email/send-notification routes they call), each
// independently gated by its own toggle. Gating insertion itself here
// would make "email only, no push" impossible, since email delivery reads
// off this same row.
export async function notify(supabase: SupabaseClient, {
  userId, actorId, type, message, link, targetId, targetType,
}: {
  userId: string
  actorId?: string | null
  type: NotificationType
  message: string
  link?: string | null
  targetId?: string | null
  targetType?: string | null
}) {
  if (!userId || userId === actorId) return // never notify yourself

  const { error } = await supabase.from('notifications').insert({
    user_id: userId,
    actor_id: actorId ?? null,
    type,
    message,
    link: link ?? null,
    target_id: targetId ?? null,
    target_type: targetType ?? null,
  })
  // Every caller (follows, reactions, comments, etc.) treats its own action
  // as already-succeeded by the time it calls notify() — this is purely a
  // side effect, so a failure here shouldn't roll any of that back. Logged
  // so a systemic problem (e.g. a bad migration) is at least visible.
  if (error) console.error('[notify] failed to insert notification', { type, userId, error })
}

// Fans a notification out to everyone following `actorId` — e.g. "so-and-so
// posted a new pick" for each of their followers. Reuses notify() per
// recipient (not a bulk insert) so each follower's own notification
// preference is still respected individually.
export async function notifyFollowers(supabase: SupabaseClient, {
  actorId, type, message, link, targetId, targetType,
}: {
  actorId: string
  type: NotificationType
  message: string
  link?: string | null
  targetId?: string | null
  targetType?: string | null
}) {
  const { data: followers } = await supabase.from('follows').select('follower_id').eq('following_id', actorId)
  for (const f of followers ?? []) {
    await notify(supabase, { userId: (f as any).follower_id, actorId, type, message, link, targetId, targetType })
  }
}
