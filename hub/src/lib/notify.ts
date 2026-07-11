import type { SupabaseClient } from '@supabase/supabase-js'

export type NotificationType = 'follow' | 'reaction' | 'comment' | 'mention' | 'pick_result' | 'subscription' | 'message' | 'repost'

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
