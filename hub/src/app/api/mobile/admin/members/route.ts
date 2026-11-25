import { NextResponse } from 'next/server'
import { effectiveTier, WHOP_PLANS, type Tier } from '@slipsurge/core/tiers'
import { isAccountId } from '@/lib/blocks'
import { adminDecisionActor } from '@/lib/supabase/adminDecisionActor'

const headers = { 'Cache-Control': 'private, no-store' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })
const accountTypes = ['user', 'creator', 'admin']
const tiers = ['free', 'basic', 'advanced', 'ultimate']
const fields = 'id,username,display_name,avatar_url,email,account_type,is_verified,is_active_member,follower_count,created_at,tier,discord_advanced_claimed,admin_granted_tier,admin_granted_tier_at,beta_access_active,verified_identities,whop_user_id,whop_plan_id,tier_status,tier_current_period_end,tier_purchased_at,whop_membership_id'

type MobileMemberRow = {
  id: string; username: string; display_name: string | null; avatar_url: string | null; email: string | null; account_type: string;
  is_verified: boolean; is_active_member: boolean; follower_count: number | null; created_at: string; tier: Tier | null;
  discord_advanced_claimed: boolean | null; admin_granted_tier: Tier | null; admin_granted_tier_at: string | null;
  beta_access_active: boolean | null; verified_identities: Record<string, unknown> | null; whop_user_id: string | null;
  whop_plan_id: string | null; tier_status: string | null; tier_current_period_end: string | null; tier_purchased_at: string | null;
  whop_membership_id: string | null;
}

function member(row: MobileMemberRow, emailVerified: boolean | null, bannedUntil?: string | null) {
  const { verified_identities, whop_user_id, whop_plan_id, ...profile } = row
  return { ...profile,
    effectiveTier: effectiveTier(row.tier ?? 'free', row.discord_advanced_claimed, row.admin_granted_tier),
    connections: { discord: Boolean(verified_identities?.discord), x: Boolean(verified_identities?.x), whop: Boolean(whop_user_id) },
    planName: whop_plan_id ? WHOP_PLANS[whop_plan_id]?.label ?? null : null, emailVerified, bannedUntil,
  }
}

export async function GET(request: Request) {
  if (!request.headers.has('authorization')) return reply({ error: 'Sign in required' }, 401)
  const actor = await adminDecisionActor(request)
  if (actor.error) return actor.error
  const { admin } = actor
  const query = new URL(request.url).searchParams
  const id = query.get('id')
  if (id) {
    if (!isAccountId(id)) return reply({ error: 'Member not found' }, 404)
    const [profile, auth] = await Promise.all([
      admin.from('users').select(fields).eq('id', id).maybeSingle(), admin.auth.admin.getUserById(id),
    ])
    if (profile.error) return reply({ error: 'Member details could not be loaded' }, 503)
    if (!profile.data) return reply({ error: 'Member not found' }, 404)
    return reply({ member: member(profile.data as MobileMemberRow, auth.error ? null : Boolean(auth.data.user?.email_confirmed_at),
      auth.error ? undefined : auth.data.user?.banned_until ?? null), authAvailable: !auth.error })
  }

  if (query.get('view') === 'recent') {
    const auth = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (auth.error) return reply({ error: 'Recent sign-ins could not be loaded' }, 503)
    const signedIn = auth.data.users.flatMap(user => {
      const at = Date.parse(user.last_sign_in_at ?? '')
      return Number.isFinite(at) ? [{ id: user.id, email: user.email, at }] : []
    }).sort((a, b) => b.at - a.at).slice(0, 100)
    if (!signedIn.length) return reply({ signIns: [] })
    const profiles = await actor.supabase.from('users').select('id,username,display_name,avatar_url').in('id', signedIn.map(user => user.id))
    if (profiles.error) return reply({ error: 'Recent member profiles could not be loaded' }, 503)
    const byId = new Map(profiles.data.map(profile => [profile.id, profile]))
    const threshold = Date.now() - 15 * 60_000
    return reply({ signIns: signedIn.map(user => {
      const profile = byId.get(user.id)
      return {
        id: user.id, name: profile?.display_name || profile?.username || user.email || 'No profile',
        username: profile?.username ?? null, avatarUrl: profile?.avatar_url ?? null,
        lastSignIn: new Date(user.at).toISOString(), recent: user.at >= threshold,
      }
    }) })
  }

  const search = (query.get('q') ?? '').trim().slice(0, 64).replace(/[^\p{L}\p{N}@._+\-' ]/gu, '')
  const type = query.get('type'), tier = query.get('tier')
  if (type && !accountTypes.includes(type) || tier && !tiers.includes(tier)) return reply({ error: 'Invalid member filters' }, 400)
  const page = Number(query.get('page') ?? '0')
  if (!Number.isSafeInteger(page) || page < 0 || page > 100) return reply({ error: 'Invalid member page' }, 400)
  if (query.get('view') === 'banned') {
    const auth = await admin.auth.admin.listUsers({ page: page + 1, perPage: 100 })
    if (auth.error) return reply({ error: 'Banned accounts could not be loaded' }, 503)
    const banned = new Map(auth.data.users.filter(user => user.banned_until && Date.parse(user.banned_until) > Date.now()).map(user => [user.id, user]))
    if (!banned.size) return reply({ members: [], hasMore: auth.data.users.length === 100 })
    const records = await admin.from('users').select(fields).in('id', [...banned.keys()]).order('created_at', { ascending: false })
    if (records.error) return reply({ error: 'Banned profiles could not be loaded' }, 503)
    const matches = (records.data as MobileMemberRow[]).filter(row => !search || [row.username, row.display_name, row.email].some(value =>
      value?.toLowerCase().includes(search.toLowerCase())))
    return reply({ members: matches.map(row => member(row, Boolean(banned.get(row.id)?.email_confirmed_at), banned.get(row.id)?.banned_until)),
      hasMore: auth.data.users.length === 100 })
  }

  let requestRows = admin.from('users').select(fields).order('created_at', { ascending: false }).order('id', { ascending: false })
  if (search) requestRows = requestRows.or(`username.ilike.%${search}%,display_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (type) requestRows = requestRows.eq('account_type', type)
  const from = page * 50
  const result = await (tier ? requestRows.limit(500) : requestRows.range(from, from + 50))
  if (result.error) return reply({ error: 'Member search could not be loaded' }, 503)
  const filtered = (result.data as MobileMemberRow[]).filter(row => !tier || effectiveTier(row.tier ?? 'free', row.discord_advanced_claimed, row.admin_granted_tier) === tier)
  const visible = tier ? filtered.slice(from, from + 50) : filtered.slice(0, 50)
  const emailResult = visible.length ? await admin.from('admin_user_email_status').select('id,email_verified').in('id', visible.map(row => row.id)) : null
  const statuses = new Map(emailResult?.data?.map(row => [row.id, row.email_verified]) ?? [])
  return reply({ members: visible.map(row => member(row, statuses.get(row.id) ?? null)),
    hasMore: tier ? filtered.length > from + 50 : filtered.length > 50 })
}
