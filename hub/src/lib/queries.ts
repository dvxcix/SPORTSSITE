import { createClient } from './supabase/server'
import type { Post, Channel, Message, Notification, User } from './supabase/types'

// No post query anywhere checked whether the CURRENT viewer already reacted
// or reposted — every post always came back with user_reacted/user_reposted
// implicitly undefined, so a like/repost always rendered as un-done again
// after any refresh (the visible symptom), even though the underlying row
// was there in `reactions`/`reposts` the whole time.
//
// user_reacted_emojis carries the full set of emojis THIS viewer reacted
// with (not just a single ❤️ boolean) — reactions are multi-emoji now, any
// standard or custom emoji, not just a heart-shaped like button.
export async function attachUserReactions<T extends { id: string }>(
  posts: T[], userId: string | null | undefined
): Promise<(T & { user_reacted: boolean; user_reacted_emojis: string[]; user_reposted: boolean; user_poll_vote: number | null })[]> {
  if (!userId || posts.length === 0) return posts.map(p => ({ ...p, user_reacted: false, user_reacted_emojis: [], user_reposted: false, user_poll_vote: null }))
  const supabase = await createClient()
  const postIds = posts.map(p => p.id)
  const [{ data: likes }, { data: reposts }, { data: pollVotes }] = await Promise.all([
    supabase.from('reactions').select('target_id, emoji').eq('user_id', userId).eq('target_type', 'post').in('target_id', postIds),
    supabase.from('reposts').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('post_poll_votes').select('post_id, option_index').eq('user_id', userId).in('post_id', postIds),
  ])
  const emojisByPost = new Map<string, string[]>()
  for (const r of likes ?? []) {
    const arr = emojisByPost.get((r as any).target_id) ?? []
    arr.push((r as any).emoji)
    emojisByPost.set((r as any).target_id, arr)
  }
  const reposted = new Set((reposts ?? []).map((r: any) => r.post_id))
  const voteByPost = new Map<string, number>()
  for (const v of pollVotes ?? []) voteByPost.set((v as any).post_id, (v as any).option_index)
  return posts.map(p => {
    const emojis = emojisByPost.get(p.id) ?? []
    return {
      ...p, user_reacted: emojis.length > 0, user_reacted_emojis: emojis, user_reposted: reposted.has(p.id),
      user_poll_vote: voteByPost.has(p.id) ? voteByPost.get(p.id)! : null,
    }
  })
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return null
  const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  return data
}

export async function getFeedPosts(limit = 20, offset = 0): Promise<Post[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('posts')
    .select(`*, author:users!posts_author_id_fkey(id,username,display_name,avatar_url,is_verified,account_type,pick_record)`)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  return data ?? []
}

export async function getChannels(): Promise<Channel[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('channels')
    .select('*')
    .eq('channel_type', 'public')
    .order('is_pinned', { ascending: false })
    .order('member_count', { ascending: false })
  return data ?? []
}

export async function getChannelMessages(channelId: string, limit = 50): Promise<Message[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('messages')
    .select(`*, sender:users(id,username,display_name,avatar_url,is_verified,account_type)`)
    .eq('channel_id', channelId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit)
  return data ?? []
}

export async function getNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notifications')
    .select(`*, actor:users(id,username,display_name,avatar_url)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30)
  return data ?? []
}

export async function getUserProfile(username: string): Promise<User | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('users').select('*').eq('username', username).single()
  return data
}

const POST_WITH_AUTHOR = `*, author:users!posts_author_id_fkey(id,username,display_name,avatar_url,is_verified,account_type,pick_record)`

// A profile's post list is authored posts UNION what that user reposted —
// reposting previously had zero visible effect anywhere (it only bumped a
// counter on the original post), so a user's own reposts never actually
// showed up on their own profile. Reposts are annotated with reposted_by/
// repost_created_at and merged in, timeline-sorted by whichever timestamp
// is relevant (repost time for reposts, post time for original posts).
export async function getUserPosts(userId: string): Promise<Post[]> {
  const supabase = await createClient()
  const [{ data: authored }, { data: repostRows }] = await Promise.all([
    supabase.from('posts')
      .select(POST_WITH_AUTHOR)
      .eq('author_id', userId)
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('reposts')
      .select(`created_at, reposted_by:users!reposts_user_id_fkey(username,display_name,avatar_url), post:posts(${POST_WITH_AUTHOR})`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const reposted = ((repostRows ?? []) as any[])
    .filter(r => r.post && r.post.visibility === 'public')
    .map(r => ({ ...r.post, reposted_by: r.reposted_by, repost_created_at: r.created_at }))

  return [...(authored ?? []), ...reposted]
    .sort((a: any, b: any) =>
      new Date(b.repost_created_at ?? b.created_at).getTime() - new Date(a.repost_created_at ?? a.created_at).getTime())
    .slice(0, 20)
}

export async function getLeaderboard(sport = 'MLB', limit = 50) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('users')
    .select('id,username,display_name,avatar_url,is_verified,pick_record,account_type')
    .order('pick_record->>wins', { ascending: false })
    .limit(limit)
  return data ?? []
}
