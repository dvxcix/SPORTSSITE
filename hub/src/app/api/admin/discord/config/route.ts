import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeApiError } from '@/lib/safeApiError'

const DISCORD_ID = /^\d{17,20}$/

function validateMappings(
  value: unknown,
  allowedKeys: ReadonlySet<string>,
  label: string,
): { value?: Record<string, string>; error?: NextResponse } {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: NextResponse.json({ error: `${label} must be an object` }, { status: 400 }) }
  }

  const entries = Object.entries(value)
  for (const [key, id] of entries) {
    if (!allowedKeys.has(key) || typeof id !== 'string' || !DISCORD_ID.test(id)) {
      return { error: NextResponse.json({ error: `Invalid ${label} mapping` }, { status: 400 }) }
    }
  }
  return { value: Object.fromEntries(entries) as Record<string, string> }
}

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
  const { data } = await admin
    .from('discord_config')
    .select('id,guild_id,alert_channels,tier_roles,enabled,updated_at')
    .eq('id', 1)
    .single()
  return NextResponse.json({ config: data })
}

export async function PATCH(req: Request) {
  const { error } = await requireAdmin()
  if (error) return error
  const body = await req.json().catch(() => ({}))

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.guild_id === 'string') {
    const guildId = body.guild_id.trim()
    if (guildId && !DISCORD_ID.test(guildId)) return NextResponse.json({ error: 'Invalid server ID' }, { status: 400 })
    update.guild_id = guildId || null
  }
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  const channels = validateMappings(
    body.alert_channels,
    new Set(['lineup_confirmed', 'hr', 'near_hr', 'slate', 'pipeline_health']),
    'alert channel',
  )
  if (channels.error) return channels.error
  if (channels.value) update.alert_channels = channels.value

  const roles = validateMappings(
    body.tier_roles,
    new Set(['free', 'basic', 'advanced', 'ultimate']),
    'tier role',
  )
  if (roles.error) return roles.error
  if (roles.value) update.tier_roles = roles.value

  const admin = createAdminClient()
  const { data, error: updateErr } = await admin
    .from('discord_config')
    .update(update)
    .eq('id', 1)
    .select('id,guild_id,alert_channels,tier_roles,enabled,updated_at')
    .single()
  if (updateErr) return safeApiError('admin-discord-config', updateErr)
  return NextResponse.json({ config: data })
}
