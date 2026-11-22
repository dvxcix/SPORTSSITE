import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCreatorPaymentState } from '@/lib/creatorWhop'
import { creatorDeliveryReady } from '@/lib/creatorWebhookConfig'
import { safeApiError } from '@/lib/safeApiError'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const admin = createAdminClient()
  const { data: profile, error } = await admin.from('users').select('whop_connected_company_id').eq('id', user.id).single()
  if (error || !profile) return safeApiError('creator-status-profile', error)
  const headers = { 'Cache-Control': 'private, no-store' }
  if (!profile.whop_connected_company_id) return NextResponse.json({ state: 'not_connected', canCharge: false, canPayout: false, actions: [] }, { headers })
  try {
    const state = await getCreatorPaymentState(profile.whop_connected_company_id)
    const { error: updateError } = await admin.from('users').update({ creator_commerce_status: state.state, creator_commerce_updated_at: new Date().toISOString() }).eq('id', user.id)
    if (updateError) throw new Error('Payment status could not be saved')
    const deliveryReady = !state.canCharge || await creatorDeliveryReady(admin)
    return NextResponse.json(deliveryReady ? state : { ...state, state: 'unavailable', canCharge: false, actions: [{ title: 'SlipSurge payment connection needs attention. Please try again later.', pending: false }] }, { headers })
  } catch (cause) { return safeApiError('creator-status', cause, 'Payment status could not be verified. Refresh to try again.', 502) }
}
