import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FEATURE_FLAGS, type FeatureRolloutAudience } from '@/lib/featureFlags'
import { safeApiError } from '@/lib/safeApiError'

const FEATURE_KEYS = new Set<string>(Object.values(FEATURE_FLAGS))
const AUDIENCES = new Set<FeatureRolloutAudience>(['off', 'admins', 'members', 'percentage', 'everyone'])

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).maybeSingle()
  if (profile?.account_type !== 'admin') return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user, error: null }
}

export async function GET() {
  const auth = await requireAdmin()
  if (auth.error) return auth.error
  const admin = createAdminClient()
  const { data, error } = await admin.from('feature_rollouts').select('feature_key, audience, rollout_percent, rollout_salt, updated_at').in('feature_key', [...FEATURE_KEYS]).order('feature_key')
  if (error) return safeApiError('admin-feature-rollouts-read', error)
  return NextResponse.json({ rollouts: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  const auth = await requireAdmin()
  if (auth.error || !auth.user) return auth.error
  const body = await request.json().catch(() => null)
  const featureKey = typeof body?.featureKey === 'string' ? body.featureKey : ''
  const audience = typeof body?.audience === 'string' ? body.audience as FeatureRolloutAudience : ''
  const rolloutPercent = Number(body?.rolloutPercent)
  if (!FEATURE_KEYS.has(featureKey) || !AUDIENCES.has(audience as FeatureRolloutAudience) || !Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
    return NextResponse.json({ error: 'Invalid rollout configuration' }, { status: 400 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from('feature_rollouts').upsert({ feature_key: featureKey, audience, rollout_percent: audience === 'percentage' ? rolloutPercent : audience === 'off' || audience === 'admins' ? 0 : 100, updated_by: auth.user.id, updated_at: new Date().toISOString() }, { onConflict: 'feature_key' }).select('feature_key, audience, rollout_percent, rollout_salt, updated_at').single()
  if (error) return safeApiError('admin-feature-rollout-write', error)
  return NextResponse.json({ rollout: data }, { headers: { 'Cache-Control': 'no-store' } })
}
