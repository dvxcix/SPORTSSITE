import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'follow' | 'reaction' | 'comment' | 'mention' | 'pick_result' | 'subscription' | 'message' | 'repost' | 'group_invite' | 'new_pick'

// Maps each notification type to its toggle key in users.notification_settings
// (see NotificationSettingsForm) — settings/notifications previously wrote
// this jsonb column but nothing ever read it back, so every toggle was a
// no-op. Checked here, in the one place every notification insert goes
// through, so it's enforced regardless of call site.
const SETTINGS_KEY_BY_TYPE: Record<NotificationType, string> = {
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

  const settingsKey = SETTINGS_KEY_BY_TYPE[type]
  const { data: recipient } = await supabase.from('users').select('notification_settings').eq('id', userId).maybeSingle()
  // Undefined/missing key defaults to enabled (matches NotificationSettingsForm's
  // own default) — only an explicit `false` suppresses the notification.
  if ((recipient?.notification_settings as Record<string, boolean> | null)?.[settingsKey] === false) return

  await supabase.from('notifications').insert({
    user_id: userId,
    actor_id: actorId ?? null,
    type,
    message,
    link: link ?? null,
    target_id: targetId ?? null,
    target_type: targetType ?? null,
  })
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
