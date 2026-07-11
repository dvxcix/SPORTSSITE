export interface User {
  id: string
  email: string
  username: string
  display_name?: string
  bio?: string
  avatar_url?: string
  banner_url?: string
  sport_preferences: string[]
  account_type: 'user' | 'creator' | 'admin'
  is_verified: boolean
  is_active_member: boolean
  follower_count: number
  following_count: number
  pick_record: { wins: number; losses: number; pushes: number }
  favorite_teams: string[]
  website?: string
  twitter_handle?: string
  location?: string
  created_at: string
  // Already present on the DB table (pre-existing, unused until the Whop
  // OAuth bridge) — not new columns, just newly reflected here.
  whop_user_id?: string
  whop_membership_id?: string
  membership_expires_at?: string
}

export interface Post {
  id: string
  author_id: string
  author?: User
  content: string
  media_urls: string[]
  post_type: 'text' | 'pick' | 'parlay' | 'poll' | 'analysis' | 'reel'
  sport?: string
  game_pk?: string
  book?: string | null
  wager_amount?: number | null
  potential_payout?: number | null
  combined_odds?: number | null
  pick_data?: {
    team: string | null
    line: string
    odds: string | number | null
    book?: string | null
    result?: 'win' | 'loss' | 'push' | 'pending'
    sport?: string
    // Structured-pick fields (present when posted via the player/market
    // search composer or the Dugout watchlist) — absent on older freeform
    // picks, which fall back to the plain team/line/odds/book display.
    mlb_id?: number | null
    player_name?: string
    headshot_url?: string | null
    game_pk?: string | null
    game_date?: string | null
    prop_key?: string
    prop_label?: string
    wager_amount?: number | null
    potential_payout?: number | null
    // Parlay posts (post_type === 'parlay') store their legs here instead
    // of the single-pick fields above.
    legs?: {
      player_name: string
      team: string | null
      mlb_id: number | null
      headshot_url?: string | null
      prop_key: string
      prop_label: string
      line: string
      odds: number | null
      result: 'win' | 'loss' | 'push' | 'pending'
    }[]
    combined_odds?: number | null
  }
  poll_data?: {
    options: { text: string; votes: number }[]
    ends_at: string
  }
  visibility: 'public' | 'followers' | 'subscribers'
  is_premium: boolean
  reaction_count: number
  comment_count: number
  repost_count: number
  created_at: string
  user_reacted?: boolean
  user_bookmarked?: boolean
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  author?: User
  parent_id?: string
  content: string
  reaction_count: number
  replies?: Comment[]
  created_at: string
}

export interface Channel {
  id: string
  name: string
  slug: string
  description?: string
  icon?: string
  channel_type: 'public' | 'members_only' | 'vip'
  sport?: string
  owner_id?: string
  member_count: number
  message_count: number
  is_pinned: boolean
  created_at: string
  is_member?: boolean
}

export interface Message {
  id: string
  sender_id: string
  sender?: User
  channel_id?: string
  dm_recipient_id?: string
  content: string
  media_urls: string[]
  reply_to_id?: string
  reply_to?: Message
  message_type: 'text' | 'pick' | 'gif' | 'media'
  pick_data?: Post['pick_data']
  is_deleted: boolean
  created_at: string
  edited_at?: string
}

export interface Notification {
  id: string
  user_id: string
  actor_id?: string
  actor?: User
  type: 'follow' | 'reaction' | 'comment' | 'mention' | 'pick_result' | 'subscription' | 'message'
  target_id?: string
  target_type?: string
  data?: Record<string, unknown>
  read: boolean
  created_at: string
}

export interface CreatorTier {
  id: string
  creator_id: string
  creator?: User
  name: string
  price_monthly: number
  price_yearly?: number
  features: string[]
  stripe_price_id?: string
  color: string
  max_subscribers?: number
  is_active: boolean
  subscriber_count?: number
}

export interface Subscription {
  id: string
  subscriber_id: string
  creator_id: string
  tier_id: string
  tier?: CreatorTier
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  current_period_end: string
  created_at: string
}
