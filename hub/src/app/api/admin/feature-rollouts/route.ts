import { NextRequest, NextResponse } from 'next/server'
import { adminMemberOperator } from '@/lib/supabase/adminMemberOperator'
import { createAdminClient } from '@/lib/supabase/admin'
import { FEATURE_FLAGS, type FeatureRolloutAudience } from '@/lib/featureFlags'
import { safeApiError } from '@/lib/safeApiError'

const FEATURE_KEYS = new Set<string>(Object.values(FEATURE_FLAGS))
const AUDIENCES = new Set<FeatureRolloutAudience>(['off', 'admins', 'members', 'percentage', 'everyone'])

export async function GET(request: Request) {
  const auth = await adminMemberOperator(request)
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
  const auth = await adminMemberOperator(request)
  if (auth.error) return auth.error
  const body = await request.json().catch(() => null)
  const featureKey = typeof body?.featureKey === 'string' ? body.featureKey : ''
  const audience = typeof body?.audience === 'string' ? body.audience as FeatureRolloutAudience : ''
  const rolloutPercent = Number(body?.rolloutPercent)
  if (!FEATURE_KEYS.has(featureKey) || !AUDIENCES.has(audience as FeatureRolloutAudience) || !Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100) {
    return NextResponse.json({ error: 'Invalid rollout configuration' }, { status: 400 })
  }
  const admin = createAdminClient()
  const update = { feature_key: featureKey, audience, rollout_percent: audience === 'percentage' ? rolloutPercent : audience === 'off' || audience === 'admins' ? 0 : 100,
    updated_by: auth.adminId, updated_at: new Date().toISOString() }
  const fields = 'feature_key, audience, rollout_percent, rollout_salt, updated_at'
  const table = admin.from('feature_rollouts')
  if (request.headers.has('authorization')) {
    const expected = body.expectedUpdatedAt
    if (expected !== null && (typeof expected !== 'string' || !Number.isFinite(Date.parse(expected)))) {
      return NextResponse.json({ error: 'Refresh saved rollouts before making a change' }, { status: 400 })
    }
    const change = expected === null ? table.insert(update) : table.update(update).eq('feature_key', featureKey).eq('updated_at', expected)
    const { data, error } = await change.select(fields).maybeSingle()
    if (error?.code === '23505' || !error && !data) {
      return NextResponse.json({ error: 'This rollout changed. Refresh the saved settings.' }, { status: 409 })
    }
    if (error) return safeApiError('admin-feature-rollout-write', error)
    return NextResponse.json({ rollout: data }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const { data, error } = await table.upsert(update, { onConflict: 'feature_key' }).select(fields).single()
  if (error) return safeApiError('admin-feature-rollout-write', error)
  return NextResponse.json({ rollout: data }, { headers: { 'Cache-Control': 'no-store' } })
}
