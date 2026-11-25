import { NextResponse } from 'next/server'
import { registerCreatorDiscordCommands } from '@/lib/creatorDiscordCommands'
import { safeApiError } from '@/lib/safeApiError'
import { discordAdminActor } from '@/lib/discordAdminActor'
import { writeAdminAudit } from '@/lib/adminAudit'

// Global slash commands only need re-registering when the command LIST
// itself changes (a new command, a renamed/removed one) — Discord caches
// these for up to an hour on first roll-out, so this is a manual admin
// button (see /admin/discord) rather than something run on every deploy.
// Must stay in sync with the `name` switch in
// /api/discord/interactions/route.ts, or Discord will show a command this
// route doesn't know how to answer.

export async function POST(request:Request) {
  if(!request.headers.has('authorization') && request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Open Discord administration from SlipSurge.'},{status:403})
  const actor = await discordAdminActor(request)
  if (actor.error) return actor.error

  try {
    const registered = await registerCreatorDiscordCommands()
    if (actor.native) await writeAdminAudit(actor.admin, { actorUserId: actor.id, action: 'discord_register_commands',
      targetType: 'discord', request })
    return NextResponse.json({ ok: true, registered })
  } catch (error) {
    return safeApiError('admin-discord-register-commands', error, 'Failed to register commands')
  }
}
