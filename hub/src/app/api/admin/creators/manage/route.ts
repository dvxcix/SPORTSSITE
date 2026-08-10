import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAdminAudit } from '@/lib/adminAudit'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: operator } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (operator?.account_type !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const admin = createAdminClient()
  const now = new Date().toISOString()
  if (body.action === 'set_product_status' && ['active', 'paused'].includes(body.status)) {
    const { error } = await admin.from('creator_products').update({ status: body.status, updated_at: now }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAdminAudit(admin, { actorUserId: user.id, action: 'creator.product_status_changed', targetType: 'creator_product', targetId: body.id, details: { status: body.status }, request })
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'revoke_entitlement') {
    const { error } = await admin.from('creator_entitlements').update({ status: 'revoked', updated_at: now }).eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAdminAudit(admin, { actorUserId: user.id, action: 'creator.entitlement_revoked', targetType: 'creator_entitlement', targetId: body.id, request })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Invalid management action' }, { status: 400 })
}
