import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { safeApiError } from '@/lib/safeApiError'

export const dynamic = 'force-dynamic'

const ALLOWED_SPORTS = new Set(['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Tennis', 'Golf'])
const ALLOWED_CONTENT = new Set(['research', 'picks', 'live-games', 'community', 'creators', 'results'])
const ALLOWED_MARKETS = new Set(['moneyline', 'player-props', 'milestones', 'first-score', 'live', 'matrices'])
const ALERT_KEYS = ['lineup_confirmed', 'new_pick', 'pick_result', 'dm'] as const

function boundedStrings(value: unknown, allowed: Set<string> | null, maxItems: number, maxLength = 40) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0 && item.length <= maxLength && (!allowed || allowed.has(item))))]
    .slice(0, maxItems)
}

function safeImageUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.href.length <= 2048 ? url.href : null
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Your session expired. Sign in again to finish setup.', code: 'SESSION_EXPIRED' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Account setup details were invalid.' }, { status: 400 })
  }

  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 60) : ''
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 280) : ''
  const sports = boundedStrings(body.sports, ALLOWED_SPORTS, 8)
  const teams = boundedStrings(body.teams, null, 64, 12)
  const contentMix = boundedStrings(body.contentMix, ALLOWED_CONTENT, 6)
  const marketFocus = boundedStrings(body.marketFocus, ALLOWED_MARKETS, 6)
  const requestedAlerts = body.alerts && typeof body.alerts === 'object' ? body.alerts as Record<string, unknown> : {}

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('id, notification_settings, interest_settings')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) return safeApiError('account-onboarding-profile', profileError, 'We could not load your account setup.')
  if (!profile) {
    return NextResponse.json({ error: 'Your account profile is not ready yet. Refresh and try again.', code: 'PROFILE_NOT_READY' }, { status: 409 })
  }

  const alerts = { ...((profile.notification_settings as Record<string, boolean> | null) ?? {}) }
  for (const key of ALERT_KEYS) {
    if (typeof requestedAlerts[key] === 'boolean') alerts[key] = requestedAlerts[key] as boolean
  }

  const interests = (profile.interest_settings as Record<string, unknown> | null) ?? {}
  const { error: updateError } = await admin.from('users').update({
    display_name: displayName || undefined,
    bio: bio || undefined,
    avatar_url: safeImageUrl(body.avatarUrl) || undefined,
    favorite_teams: teams,
    favorite_sports: sports,
    interest_settings: { ...interests, content_mix: contentMix, market_focus: marketFocus, discovery_mode: interests.discovery_mode ?? 'balanced' },
    is_private: body.isPrivate === true,
    hide_win_rate: body.hideWinRate === true,
    notification_settings: alerts,
    onboarding_completed_at: new Date().toISOString(),
  }).eq('id', user.id)

  if (updateError) return safeApiError('account-onboarding-save', updateError, 'We could not save your profile.')
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
