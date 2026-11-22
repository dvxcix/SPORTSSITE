import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorWhop, getCreatorPaymentState } from './creatorWhop'
import { creatorMembershipState, type CreatorMembership } from './creatorMembership'

export function membershipBelongsTo(member: CreatorMembership, expected: { accountId: string; planId: string; whopUserId: string }) {
  return /^mem_[A-Za-z0-9]+$/.test(member.id) && member.account?.id === expected.accountId && member.variant_id === expected.planId && member.user_id === expected.whopUserId
}

/** Restore only the signed-in member's verified Whop identity, in this creator's exact child account. */
export async function restoreCreatorAccess(admin: SupabaseClient, userId: string, productId: string) {
  const [{ data: profile, error: profileError }, { data: product, error: productError }] = await Promise.all([
    admin.from('users').select('whop_user_id').eq('id', userId).single(),
    admin.from('creator_products').select('id,creator_id,whop_plan_id,product_type,status').eq('id', productId).in('status', ['active', 'paused']).maybeSingle(),
  ])
  if (profileError || productError) throw new Error('Access could not be checked.')
  if (!product?.whop_plan_id) return { state: 'unavailable' as const }
  if (!profile?.whop_user_id) return { state: 'link_required' as const }
  const { data: owner, error } = await admin.from('users').select('whop_connected_company_id').eq('id', product.creator_id).single()
  if (error || !owner?.whop_connected_company_id) throw new Error('Creator account unavailable.')
  const expected = { accountId: owner.whop_connected_company_id as string, planId: product.whop_plan_id as string, whopUserId: profile.whop_user_id as string }
  await getCreatorPaymentState(expected.accountId) // Verifies parent ownership; charge capability is not an access requirement.
  let cursor: string | null = null
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({ account_id: expected.accountId, user_id: expected.whopUserId, variant_id: expected.planId, first: '100' })
    if (cursor) query.set('after', cursor)
    const result = await creatorWhop<{ data: CreatorMembership[]; page_info: { has_next_page: boolean; end_cursor: string | null } }>(`/memberships?${query}`)
    for (const candidate of result.data) {
      if (!membershipBelongsTo(candidate, expected)) continue
      const member = await creatorWhop<CreatorMembership>(`/memberships/${encodeURIComponent(candidate.id)}`)
      if (!membershipBelongsTo(member, expected)) throw new Error('Membership ownership mismatch.')
      const state = creatorMembershipState(member, product.product_type === 'membership')
      if (!['active', 'trialing'].includes(state.status)) continue
      const { error: saveError } = await admin.rpc('apply_creator_membership', {
        p_event_id: `restore:${member.id}:${state.providerUpdatedAt}`, p_event_type: 'membership.restored',
        p_product_id: product.id, p_creator_id: product.creator_id, p_user_id: userId, p_membership_id: member.id,
        p_object_id: member.id, p_account_id: expected.accountId, p_plan_id: member.variant_id,
        p_status: state.status, p_period_end: state.periodEnd, p_provider_updated_at: state.providerUpdatedAt,
      })
      if (saveError) throw new Error('Your membership could not be linked.')
      const { data: saved, error: readError } = await admin.from('creator_entitlements').select('status,admin_revoked_at,current_period_end').eq('user_id', userId).eq('product_id', productId).single()
      if (readError) throw new Error('Access could not be verified.')
      if (saved.admin_revoked_at) return { state: 'support_required' as const }
      return { state: saved.status === 'active' || saved.status === 'trialing' ? 'active' as const : 'unavailable' as const }
    }
    if (!result.page_info.has_next_page) return { state: 'not_found' as const }
    if (!result.page_info.end_cursor || result.page_info.end_cursor === cursor) break
    cursor = result.page_info.end_cursor
  }
  throw new Error('Membership search could not complete. Please contact support.')
}
