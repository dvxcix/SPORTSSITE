import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorWhop, getCreatorPaymentState } from './creatorWhop'
import { creatorMembershipState, creatorMoney, type CreatorMembership } from './creatorMembership'
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const text = (value: unknown) => typeof value === 'string' ? value : undefined
const idOf = (value: unknown) => text(value) || text(object(value).id)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const lifecycle = new Set(['payment.succeeded', 'payment.failed', 'membership.activated', 'membership.deactivated', 'membership.updated', 'membership.went_valid', 'membership.went_invalid', 'membership.cancel_at_period_end_changed', 'refund.created', 'refund.updated'])

/** Resolve creator events before main-tier routing. Only authoritative Whop membership state can grant access. */
export async function handleCreatorWebhook(admin: SupabaseClient, eventId: string, type: string | undefined, data: Record<string, unknown>): Promise<boolean> {
 const metadata = object(data.metadata)
 if (type === 'account.updated') {
   const accountId = idOf(data)
   if (!accountId) return false
   const { data: owner, error } = await admin.from('users').select('id').eq('whop_connected_company_id', accountId).maybeSingle()
   if (error) throw new Error('Creator account lookup failed')
   if (!owner) return false
   const state = await getCreatorPaymentState(accountId)
   const { error: saveError } = await admin.from('users').update({ creator_commerce_status: state.state, creator_commerce_updated_at: new Date().toISOString() }).eq('id', owner.id)
   if (saveError) throw new Error('Creator status update failed')
   return true
 }
 const membershipId = type?.startsWith('membership.') ? text(data.id) : idOf(data.membership) || text(data.membership_id)
 const planId = text(data.variant_id) || text(data.plan_id) || idOf(data.plan)
 let product: { id: string; creator_id: string; whop_plan_id: string; product_type: string } | null = null
 if (planId) {
   const result = await admin.from('creator_products').select('id,creator_id,whop_plan_id,product_type').eq('whop_plan_id', planId).maybeSingle()
   if (result.error) throw new Error('Creator offer lookup failed')
   product = result.data
 }
 let entitlement: { user_id: string; product_id: string; creator_id: string } | null = null
 if (membershipId && /^mem_[A-Za-z0-9]+$/.test(membershipId)) {
   const result = await admin.from('creator_entitlements').select('user_id,product_id,creator_id').eq('whop_membership_id', membershipId).maybeSingle()
   if (result.error) throw new Error('Creator membership lookup failed')
   entitlement = result.data
 }
 const candidate = text(metadata.slipsurge_product_id) || entitlement?.product_id
 if (!product && candidate && UUID.test(candidate)) {
   const result = await admin.from('creator_products').select('id,creator_id,whop_plan_id,product_type').eq('id', candidate).maybeSingle()
   if (result.error) throw new Error('Creator offer lookup failed')
   product = result.data
 }
 if (!product) {
   if (metadata.slipsurge_product_id || metadata.slipsurge_creator_id) throw new Error('Unknown creator offer')
   return false
 }
 if (!type || !lifecycle.has(type)) return true
 if (!membershipId || !/^mem_[A-Za-z0-9]+$/.test(membershipId)) throw new Error('Creator membership identity unavailable')
 const membership = await creatorWhop<CreatorMembership>(`/memberships/${encodeURIComponent(membershipId)}`)
 const { data: creator, error: ownerError } = await admin.from('users').select('whop_connected_company_id').eq('id', product.creator_id).single()
 if (ownerError || !creator?.whop_connected_company_id || membership.id !== membershipId || membership.variant_id !== product.whop_plan_id || membership.account?.id !== creator.whop_connected_company_id
   || (metadata.slipsurge_product_id && metadata.slipsurge_product_id !== product.id)
   || (metadata.slipsurge_creator_id && metadata.slipsurge_creator_id !== product.creator_id)) throw new Error('Creator provider ownership mismatch')
 let buyer = entitlement?.user_id || text(membership.metadata?.internal_user_id) || text(metadata.internal_user_id)
 // A direct Whop purchase may have no SlipSurge checkout metadata. Match only a verified OAuth identity.
 if (!buyer && membership.user_id) {
   const linked = await admin.from('users').select('id').eq('whop_user_id', membership.user_id).maybeSingle()
   if (linked.error) throw new Error('Verified Whop identity lookup failed')
   buyer = linked.data?.id
   if (!buyer) return true // The member can link Whop and restore this subscription later.
 }
 if (!buyer || !UUID.test(buyer) || (entitlement && metadata.internal_user_id && metadata.internal_user_id !== buyer)) throw new Error('Creator buyer identity unavailable')
 const state = creatorMembershipState(membership, product.product_type === 'membership')
 const money = type === 'payment.succeeded' ? creatorMoney(data.subtotal) || creatorMoney(data.total) : null
 const legacyAmount = type === 'payment.succeeded' && typeof data.subtotal === 'number' ? data.subtotal : null
 const { error } = await admin.rpc('apply_creator_membership', {
   p_event_id: eventId, p_event_type: type, p_product_id: product.id, p_creator_id: product.creator_id, p_user_id: buyer,
   p_membership_id: membershipId, p_object_id: text(data.id) || membershipId, p_account_id: creator.whop_connected_company_id, p_plan_id: membership.variant_id,
   p_status: state.status, p_period_end: state.periodEnd, p_provider_updated_at: state.providerUpdatedAt,
   p_amount: money?.amount ?? legacyAmount, p_currency: money?.currency || text(data.currency) || 'usd',
 })
 if (error) throw new Error('Creator access transaction failed')
 return true
}
