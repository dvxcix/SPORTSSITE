import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { FeedPost } from './feedQuery'
import { nbaPortraitFallback } from './nbaPlayerPortraits'
import { sportTeamColors, sportTeamLogoUrl } from './sportTeamArtwork'

export function nativeAnonymousClient() {
  // Guest reads never inherit the browser's session or a service credential.
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function isGuestVisible(post: FeedPost & { group_id?: string | null }) {
  return post.visibility === 'public' && !post.is_premium && post.group_id === null
}

type Pick = NonNullable<FeedPost['pick_data']>
type PickLeg = NonNullable<Pick['legs']>[number]

function displayPick(value: Pick | PickLeg, fallbackSport?: string) {
  const sport = value.sport ?? fallbackSport
  const palette = sportTeamColors(sport, value.team)
  return {
    label: value.player_name ?? value.team,
    line: value.prop_label ?? value.line ?? null,
    odds: value.odds == null ? null : String(value.odds),
    result: value.result ?? null,
    sport: sport ?? null,
    team: value.team ?? null,
    teamLogo: sportTeamLogoUrl(sport, value.team),
    colors: palette ?? [],
    portraits: [...new Set([value.headshot_url, sport?.toLowerCase() === 'nba' ? nbaPortraitFallback(value.player_id) : null]
      .filter((url): url is string => typeof url === 'string' && url.length > 0))],
  }
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
      ...displayPick(post.pick_data, post.sport),
      book: post.pick_data.book ?? post.book ?? null,
      combinedOdds: (post.pick_data.combined_odds ?? post.combined_odds) == null ? null
        : String(post.pick_data.combined_odds ?? post.combined_odds),
      legs: (post.pick_data.legs ?? []).map(leg => displayPick(leg, post.sport)),
    } : null,
    poll: post.poll_data ? {
      options: post.poll_data.options.map(option => option.text),
      votes: post.poll_data.options.map(option => option.votes),
      endsAt: post.poll_data.ends_at,
    } : null,
  }
}
