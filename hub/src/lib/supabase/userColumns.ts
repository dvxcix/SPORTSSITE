// Public profile fields only. Keep billing identifiers, email, notification
// preferences and admin-grant metadata out of every public/profile query
// by default. verified_identities is intentionally public because it only
// contains the handle/profile URL rendered on a member's public profile.
export const PUBLIC_USER_COLUMNS = [
  'id', 'username', 'display_name', 'bio', 'avatar_url', 'banner_url',
  'sport_preferences', 'account_type', 'is_verified', 'is_active_member',
  'follower_count', 'following_count', 'pick_record', 'favorite_teams',
  'favorite_sports',
  'favorite_players', 'social_links', 'sportsbooks', 'website',
  'twitter_handle', 'location', 'created_at', 'is_private', 'hide_win_rate',
  'allow_dms', 'tier', 'beta_access_active', 'verified_identities',
  'onboarding_completed_at',
].join(',')

// Returned only after the account endpoint verifies the matching Supabase
// session on the server.
export const PRIVATE_ACCOUNT_COLUMNS = [
  PUBLIC_USER_COLUMNS,
  'email', 'notification_settings', 'dugout_column_prefs',
  'discord_advanced_claimed', 'admin_granted_tier',
  'admin_granted_tier_by', 'admin_granted_tier_at',
  'admin_granted_tier_note', 'onboarding_completed_at',
  'tier_status', 'tier_current_period_end', 'tier_purchased_at',
  'tier_cancel_at_period_end', 'whop_plan_id', 'whop_membership_id',
  'whop_user_id', 'whop_connected_company_id', 'creator_commerce_status',
  'membership_expires_at', 'discord_id', 'discord_username',
].join(',')
