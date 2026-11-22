import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { creatorWhop, getCreatorPaymentState } from './creatorWhop'
import { creatorDeliveryReady } from './creatorWebhookConfig'

export class CreatorOfferError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Owner and business moderation share the same provider and publication gates. */
export async function setCreatorOfferStatus(admin: SupabaseClient, productId: string, status: 'active' | 'paused', ownerId?: string) {
  let lookup = admin.from('creator_products').select('id,creator_id,whop_plan_id,status').eq('id', productId)
  if (ownerId) lookup = lookup.eq('creator_id', ownerId)
  const { data: product, error: lookupError } = await lookup.maybeSingle()
  if (lookupError) throw new CreatorOfferError('Offer could not be loaded.', 503)
  if (!product) throw new CreatorOfferError('Offer not found.', 404)
  if (product.status === 'archived') throw new CreatorOfferError('This offer is archived.', 409)
  if (status === 'active') {
    if (!product.whop_plan_id) throw new CreatorOfferError('Finish saving the offer first.', 409)
    if (!await creatorDeliveryReady(admin)) throw new CreatorOfferError('Creator payment event delivery needs attention.', 503)
    const { data: profile } = await admin.from('users').select('username,whop_connected_company_id').eq('id', product.creator_id).single()
    if (!profile?.whop_connected_company_id || profile.username?.toLowerCase() === 'slipsurge') throw new CreatorOfferError('Finish Whop setup first.', 409)
    if (!(await getCreatorPaymentState(profile.whop_connected_company_id)).canCharge) throw new CreatorOfferError('Whop payment collection is not ready.', 409)
    const { data: group, error } = await admin.from('groups').select('id').eq('creator_product_id', product.id).eq('owner_id', product.creator_id).limit(1).maybeSingle()
    if (error || !group) throw new CreatorOfferError('Create the member community before publishing.', 409)
  } else {
    const { error } = await admin.from('creator_products').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', product.creator_id)
    if (error) throw new CreatorOfferError('The offer could not be paused.', 503)
  }
  if (product.whop_plan_id) await creatorWhop(`/variants/${encodeURIComponent(product.whop_plan_id)}`, status === 'active' ? { unlimited_stock: true, visibility: 'hidden' } : { unlimited_stock: false, stock: 0, visibility: 'hidden' }, undefined, 'PATCH')
  const { error } = await admin.from('creator_products').update({ status, updated_at: new Date().toISOString() }).eq('id', product.id).eq('creator_id', product.creator_id)
  if (error) {
    if (status==='active' && product.whop_plan_id) await creatorWhop(`/variants/${encodeURIComponent(product.whop_plan_id)}`,{unlimited_stock:false,stock:0,visibility:'hidden'},undefined,'PATCH').catch(()=>{})
    throw new CreatorOfferError('Offer status could not be saved. Checkout closure needs verification; retry Pause before publishing again.', 503)
  }
  return { status, creatorId: product.creator_id }
}
