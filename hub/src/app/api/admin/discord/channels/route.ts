import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getDiscordConfig, getGuildChannels } from '@/lib/discord'
import { discordAdminActor } from '@/lib/discordAdminActor'

export async function GET(request: Request) {
  const actor = await discordAdminActor(request)
  if (actor.error) return actor.error

  const admin = createAdminClient()
  const config = await getDiscordConfig(admin)
  if (!config?.guild_id) return NextResponse.json({ channels: [] })

  const channels = await getGuildChannels(config.guild_id)
  return NextResponse.json({ channels })
}
