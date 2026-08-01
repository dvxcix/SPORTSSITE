import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

// Routed through the admin (service-role) client rather than a direct
// client-side table write — same reason every other admin mutation route in
// this codebase does (see admin/users/manage/route.ts): this isn't "your
// own row," and RLS on a brand-new table defaults to deny-all, so a raw
// client .update() would silently no-op rather than actually saving.
export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error
  const admin = createAdminClient()
  const { data } = await admin.from('discord_config').select('*').eq('id', 1).single()
  return NextResponse.json({ config: data })
}

export async function PATCH(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error
  const body = await req.json().catch(() => ({}))

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.guild_id === 'string') update.guild_id = body.guild_id.trim() || null
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if (body.alert_channels && typeof body.alert_channels === 'object') update.alert_channels = body.alert_channels
  if (body.tier_roles && typeof body.tier_roles === 'object') update.tier_roles = body.tier_roles

  const admin = createAdminClient()
  const { data, error: updateErr } = await admin.from('discord_config').update(update).eq('id', 1).select('*').single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ config: data })
}
