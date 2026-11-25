import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { FeedPost } from './feedQuery'

export function nativeAnonymousClient() {
  // Guest reads never inherit the browser's session or a service credential.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function isGuestVisible(post: FeedPost & { group_id?: string | null }) {
  return post.visibility === 'public' && !post.is_premium && post.group_id === null
}

export function mobilePost(post: FeedPost) {
  return {
    id: post.id,
    author: post.author ? {
      username: post.author.username,
      displayName: post.author.display_name,
      avatar: post.author.avatar_url,
      verified: post.author.is_verified,
    } : null,
    authorId: post.author_id,
    visibility: post.visibility,
    reactionSummary: post.reaction_summary ?? {},
    reacted: post.user_reacted_emojis ?? [],
    reposted: post.user_reposted ?? false,
    bookmarked: post.user_bookmarked ?? false,
    pollVote: post.user_poll_vote ?? null,
    repostedBy: post.reposted_by ? (post.reposted_by.display_name || post.reposted_by.username) : null,
    repostedAt: post.repost_created_at ?? null,
    createdAt: post.created_at,
    content: post.content,
    kind: post.post_type,
    sport: post.sport ?? null,
    media: post.media_urls ?? [],
    spoiler: post.is_spoiler === true,
    shareable: isGuestVisible(post),
    reactions: post.reaction_count,
    comments: post.comment_count,
    reposts: post.repost_count,
    pick: post.pick_data ? {
      label: post.pick_data.player_name ?? post.pick_data.team,
      line: post.pick_data.line ?? null,
      odds: post.pick_data.odds == null ? null : String(post.pick_data.odds),
      result: post.pick_data.result ?? null,
      legs: (post.pick_data.legs ?? []).map(leg => ({
        label: leg.player_name,
        line: leg.line,
        odds: leg.odds == null ? null : String(leg.odds),
        result: leg.result,
      })),
    } : null,
    poll: post.poll_data ? {
      options: post.poll_data.options.map(option => option.text),
      votes: post.poll_data.options.map(option => option.votes),
      endsAt: post.poll_data.ends_at,
    } : null,
  }
}
