import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { writeAdminAudit } from '@/lib/adminAudit'
import { safeApiError } from '@/lib/safeApiError'
import { CreatorOfferError, setCreatorOfferStatus } from '@/lib/creatorOfferStatus'
import { creatorWhop, getCreatorPaymentState } from '@/lib/creatorWhop'
import { creatorMembershipState, type CreatorMembership } from '@/lib/creatorMembership'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export async function POST(request: Request) {
  const auth = await creatorAdminAuth(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, admin } = auth
  const body = await request.json().catch(() => null)
  if (!body || typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ error: 'A valid record ID is required' }, { status: 400 })
  }
  const rate = await consumeServerRateLimit(user.id, 'creator_admin_manage', 60, 300)
  if (!rate.available || !rate.allowed) return NextResponse.json({ error: 'Please wait before trying again.' }, { status: rate.available ? 429 : 503 })
  try {
    if (body.action === 'set_product_status' && ['active', 'paused'].includes(body.status)) {
      await setCreatorOfferStatus(admin, body.id, body.status)
      const auditError = await writeAdminAudit(admin, { actorUserId: user.id, action: 'creator.product_status_changed', targetType: 'creator_product', targetId: body.id, details: { status: body.status }, request })
      if (auditError) return NextResponse.json({ error: 'Offer updated, but its audit receipt failed. Refresh the status before retrying.' }, { status: 503 })
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'check_creator') {
      const { data: creator } = await admin.from('users').select('whop_connected_company_id').eq('id', body.id).maybeSingle()
      if (!creator?.whop_connected_company_id) return NextResponse.json({ error: 'This creator has not connected Whop.' }, { status: 409 })
      const state = await getCreatorPaymentState(creator.whop_connected_company_id)
      const { error } = await admin.from('users').update({ creator_commerce_status: state.state, creator_commerce_updated_at: new Date().toISOString() }).eq('id', body.id)
      if (error) throw error
      return NextResponse.json({ ok: true, state: state.state, canPayout: state.canPayout })
    }
    if (['revoke_entitlement', 'restore_entitlement'].includes(body.action)) {
      if (typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.trim().length > 500) return NextResponse.json({ error: 'Add a reason from 3 to 500 characters.' }, { status: 400 })
      const { data: entitlement, error: lookupError } = await admin.from('creator_entitlements').select('id,user_id,creator_id,product_id,whop_membership_id').eq('id', body.id).maybeSingle()
      if (lookupError) throw lookupError
      if (!entitlement) return NextResponse.json({ error: 'Membership not found.' }, { status: 404 })
      const hold = body.action === 'revoke_entitlement'
      let current: ReturnType<typeof creatorMembershipState> | null = null
      if (!hold) {
        if (!entitlement.whop_membership_id) return NextResponse.json({ error: 'A Whop membership is required to verify restoration.' }, { status: 409 })
        const [{ data: offer }, { data: creator }, member] = await Promise.all([
          admin.from('creator_products').select('whop_plan_id,product_type').eq('id', entitlement.product_id).eq('creator_id', entitlement.creator_id).single(),
          admin.from('users').select('whop_connected_company_id').eq('id', entitlement.creator_id).single(),
          creatorWhop<CreatorMembership>(`/memberships/${encodeURIComponent(entitlement.whop_membership_id)}`),
        ])
        if (!offer || !creator?.whop_connected_company_id || member.id !== entitlement.whop_membership_id || member.variant_id !== offer.whop_plan_id || member.account?.id !== creator.whop_connected_company_id || member.metadata?.internal_user_id && member.metadata.internal_user_id !== entitlement.user_id) return NextResponse.json({ error: 'Provider membership ownership could not be verified.' }, { status: 409 })
        current = creatorMembershipState(member, offer.product_type === 'membership')
      }
      const { error } = await admin.rpc('creator_admin_access_hold', { p_id: entitlement.id, p_actor: user.id, p_hold: hold, p_reason: body.reason.trim(), p_provider_status: current?.status ?? null, p_period_end: current?.periodEnd ?? null, p_provider_updated_at: current?.providerUpdatedAt ?? null })
      if (error?.code === '40001') return NextResponse.json({ error: 'Membership changed. Refresh and try again.' }, { status: 409 })
      if (error) throw error
      return NextResponse.json({ ok: true, status: hold ? 'revoked' : current?.status })
    }
    return NextResponse.json({ error: 'Invalid management action' }, { status: 400 })
  } catch (cause) {
    if (cause instanceof CreatorOfferError) return NextResponse.json({ error: cause.message }, { status: cause.status })
    return safeApiError('admin-creator-manage', cause, body.status === 'paused' ? 'Local checkout is paused. Provider closure needs confirmation; retry Pause.' : 'The update could not be completed. Refresh and try again.', 502)
  }
}
