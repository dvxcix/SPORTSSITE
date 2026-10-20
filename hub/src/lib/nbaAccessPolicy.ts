import { effectiveTier, type Tier } from '@slipsurge/core/tiers'

export type NbaAccessProfile = {
  account_type?: string | null
  tier?: string | null
  discord_advanced_claimed?: boolean | null
  admin_granted_tier?: string | null
}
export const NBA_ACCESS_COLUMNS = 'account_type,tier,discord_advanced_claimed,admin_granted_tier'
const tier = (value: string | null | undefined): Tier =>
  value === 'basic' || value === 'advanced' || value === 'ultimate' ? value : 'free'

/** NBA research requires effective Ultimate; unrelated beta grants do not apply. */
export function hasNbaAccess(profile: NbaAccessProfile | null | undefined) {
  return !!profile && (profile.account_type === 'admin'
    || effectiveTier(tier(profile.tier), profile.discord_advanced_claimed, tier(profile.admin_granted_tier)) === 'ultimate')
}

/** Shared by navigation/search visibility; server routes still authorize independently. */
export function isNbaToolHref(href: string) {
  const path = href.split(/[?#]/, 1)[0]
  return path === '/the-paint' || path.startsWith('/the-paint/') || path === '/nba' || path.startsWith('/nba/')
}
