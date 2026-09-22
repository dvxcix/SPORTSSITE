import { NextResponse } from 'next/server'
import { resolveAuthedClient } from '@/lib/requireTier'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAdminAudit } from '@/lib/adminAudit'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

async function requireAdmin() {
  const { supabase, userId } = await resolveAuthedClient()
  if (!userId) return { error: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', userId).maybeSingle()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !assurance || (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2')) {
    return { error: NextResponse.json({ error: 'Two-factor verification required' }, { status: 403 }) }
  }
  return { userId }
}

export async function GET(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const admin = createAdminClient()
  const params = new URL(request.url).searchParams
  // No PostgREST expression syntax or wildcard characters from user input.
  const q = (params.get('q') ?? '').replace(/^@/, '').trim().replace(/[^a-zA-Z0-9_ -]/g, '').replace(/_/g, '\\_').slice(0, 60)
  if (params.has('q')) {
    if (q.length < 2) return NextResponse.json({ users: [] }, { headers: noStore })
    const { data: users, error } = await admin.from('users')
      .select('id,username,display_name,avatar_url').neq('account_type', 'admin')
      .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`).order('username').limit(15)
    if (error) return NextResponse.json({ error: 'Could not search members' }, { status: 500 })
    const ids = (users ?? []).map(user => user.id)
    const grants = ids.length ? await admin.from('nfl_early_access').select('user_id').in('user_id', ids) : { data: [], error: null }
    if (grants.error) return NextResponse.json({ error: 'Could not check member access' }, { status: 500 })
    const approved = new Set((grants.data ?? []).map(grant => grant.user_id))
    return NextResponse.json({ users: (users ?? []).map(user => ({ ...user, granted: approved.has(user.id) })) }, { headers: noStore })
  }
  const page = Math.max(0, Math.min(10000, Number.parseInt(params.get('page') ?? '0', 10) || 0))
  const { data, error, count } = await admin.from('nfl_early_access')
    .select('user_id,granted_at,member:users!nfl_early_access_user_id_fkey(id,username,display_name,avatar_url)', { count: 'exact' })
    .order('granted_at', { ascending: false }).order('user_id').range(page * 50, page * 50 + 49)
  if (error) return NextResponse.json({ error: 'Could not load NFL testers' }, { status: 500 })
  return NextResponse.json({ grants: data, count: count ?? 0 }, { headers: noStore })
}

export async function POST(request: Request) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.granted !== 'boolean' || typeof body.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId)) {
    return NextResponse.json({ error: 'A member and grant/revoke action are required' }, { status: 400 }) }
  const admin = createAdminClient()
  const { data: member, error: memberError } = await admin.from('users').select('id,account_type').eq('id', body.userId).maybeSingle()
  if (memberError) return NextResponse.json({ error: 'Could not check member' }, { status: 500 })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
  if (member.account_type === 'admin' && body.granted) return NextResponse.json({ error: 'Admins already have NFL access' }, { status: 400 })
  const { error } = body.granted
    ? await admin.from('nfl_early_access').upsert({ user_id: member.id, granted_by: gate.userId, granted_at: new Date().toISOString() }, { onConflict: 'user_id', ignoreDuplicates: true })
    : await admin.from('nfl_early_access').delete().eq('user_id', member.id)
  if (error) return NextResponse.json({ error: 'Could not update NFL access' }, { status: 500 })
  await writeAdminAudit(admin, { actorUserId: gate.userId!, action: body.granted ? 'nfl_access.granted' : 'nfl_access.revoked', targetType: 'user', targetId: member.id, request })
  return NextResponse.json({ granted: body.granted }, { headers: noStore })
}
