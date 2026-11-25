import 'server-only'
import { effectiveTier, type Tier } from '@slipsurge/core/tiers'
import type { createAdminClient } from './supabase/admin'
import { syncTierBadge } from './tierBadges'
import { buildWhopVerifiedIdentity, type WhopUserInfo } from './whop'

export async function applyWhopConnection(admin: ReturnType<typeof createAdminClient>, userId: string, whop: WhopUserInfo, discordAccess: boolean) {
  const { data: previousOwner, error: ownerError } = await admin.from('users').select('id').eq('whop_user_id', whop.sub).maybeSingle()
  if (ownerError) return 'link_failed' as const
  if (previousOwner && previousOwner.id !== userId) return 'already_linked_elsewhere' as const

  const { data: current, error: accountError } = await admin.from('users').select('admin_granted_tier, verified_identities').eq('id', userId).maybeSingle()
  if (accountError || !current) return 'link_failed' as const

  const { data: updated, error } = await admin.from('users').update({
    whop_user_id: whop.sub,
    discord_advanced_claimed: discordAccess,
    verified_identities: { ...(current.verified_identities ?? {}), whop: buildWhopVerifiedIdentity(whop) },
  }).eq('id', userId).select('tier').single()
  if (error?.code === '23505') return 'already_linked_elsewhere' as const
  if (error || !updated) return 'link_failed' as const

  await syncTierBadge(admin, userId, effectiveTier((updated.tier as Tier) ?? 'free', discordAccess, current.admin_granted_tier as Tier | null))
  return null
}
