import type { SupabaseClient } from '@supabase/supabase-js'
import { notify } from './notify'

// Usernames have no DB check constraint (confirmed — real ones include
// dots, e.g. "ramon.ruiz0118"), so this stays permissive on the character
// set. A token that doesn't match a real registered username just resolves
// to nothing (no notification, and the rendered link 404s) — same
// graceful-degradation behavior most platforms have for typo'd mentions.
export const MENTION_RE = /@([a-zA-Z0-9_.]{1,30})/g

export function extractMentionedUsernames(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(MENTION_RE)) out.add(m[1].toLowerCase())
  return Array.from(out)
}

// The "mention" notification type/icon/settings toggle already existed
// site-wide (TopBar, /notifications, settings) — nothing ever actually
// created one. Shared by the post composer and the comment box so an
// @mention in either place notifies the same way.
export async function notifyMentions(
  supabase: SupabaseClient,
  actorId: string,
  text: string,
  link: string,
  targetId: string,
  contextLabel: string,
) {
  const usernames = extractMentionedUsernames(text)
  if (!usernames.length) return
  const { data: mentionedUsers } = await supabase.from('users').select('id, username').in('username', usernames)
  for (const mu of mentionedUsers ?? []) {
    await notify(supabase, {
      userId: mu.id, actorId, type: 'mention',
      message: `mentioned you in ${contextLabel}`, link, targetId, targetType: 'post',
    })
  }
}
