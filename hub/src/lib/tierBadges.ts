import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tier } from './tiers'

// Real badge ids from /admin/badges (queried directly, not looked up by
// name at call time — same reasoning as BETA_TESTER_BADGE_ID: badge names
// are editable admin text with no fixed slug, the id is stable even if the
// admin renames "Advanced"/"Ultimate" later).
const ADVANCED_BADGE_ID = '08b02397-3837-4d71-b126-82f3643bf536'
const ULTIMATE_BADGE_ID = 'fdcf34d2-d7ea-469d-b697-06f2750c3c53'
const TIER_BADGE_IDS = [ADVANCED_BADGE_ID, ULTIMATE_BADGE_ID]

// Keeps the Advanced/Ultimate profile badges in lockstep with whatever tier
// an account actually has RIGHT NOW — awards the one that matches, strips
// the other if present (Ultimate replaces Advanced, doesn't stack with it),
// and strips both if they've dropped to Basic/Free. Called with the
// EFFECTIVE tier (tiers.ts's effectiveTier(), which folds in the free
// Discord-plan Advanced grant) everywhere tier can change: the Whop webhook
// (real purchase/cancellation) and the Whop OAuth callback (Discord-plan
// claim/un-claim on login). Awarded/removed by the system, not an admin —
// awarded_by stays null, same as any other automated grant.
export async function syncTierBadge(supabase: SupabaseClient, userId: string, tier: Tier): Promise<void> {
  const desired = tier === 'ultimate' ? ULTIMATE_BADGE_ID : tier === 'advanced' ? ADVANCED_BADGE_ID : null
  const toRemove = TIER_BADGE_IDS.filter(id => id !== desired)
  if (toRemove.length) {
    await supabase.from('user_badges').delete().eq('user_id', userId).in('badge_id', toRemove)
  }
  if (desired) {
    await supabase.from('user_badges').upsert({ user_id: userId, badge_id: desired }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
  }
}
