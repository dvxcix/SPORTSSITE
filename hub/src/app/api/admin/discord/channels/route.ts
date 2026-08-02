import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDiscordConfig, getGuildChannels } from '@/lib/discord'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return {}
}

export async function GET() {
  const { error } = await requireAdmin()
  if (error) return error

  const admin = createAdminClient()
  const config = await getDiscordConfig(admin)
  if (!config?.guild_id) return NextResponse.json({ channels: [] })

  const channels = await getGuildChannels(config.guild_id)
  return NextResponse.json({ channels })
}
