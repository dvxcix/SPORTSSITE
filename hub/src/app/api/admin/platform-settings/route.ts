import { NextResponse } from 'next/server'
import { creatorAdminAuth } from '@/lib/creatorAdminAuth'
import { creatorFeePercentage } from '@/lib/creatorBusiness'
import { safeApiError } from '@/lib/safeApiError'

export async function PATCH(req: Request) {
  const auth = await creatorAdminAuth()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json().catch(() => null)
  const value = creatorFeePercentage(body?.value)
  if (body?.key !== 'fee_independent_creator_pct' || value == null || typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) {
    return NextResponse.json({ error: 'Enter a fee from 0 to 99.99% with at most two decimal places.' }, { status: 400 })
  }
  const { data, error } = await auth.admin.rpc('creator_admin_update_fee', { p_actor: auth.user.id, p_value: value, p_expected_updated_at: body.expectedUpdatedAt })
  if (error?.code === '40001') return NextResponse.json({ error: 'Another admin changed the fee. Reload to review the latest rate.' }, { status: 409 })
  if (error) return safeApiError('admin-creator-fee', error)
  return NextResponse.json({ ok: true, setting: data })
}
