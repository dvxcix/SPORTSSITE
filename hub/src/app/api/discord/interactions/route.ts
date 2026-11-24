import { NextResponse, after } from 'next/server'
import { verifyDiscordSignature, editDeferredReply } from '@/lib/discord'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { PLATFORM_URL } from '@/lib/platform'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { creatorDiscordCommand, CREATOR_DISCORD_COMMANDS, discordCommandRateKey } from '@/lib/creatorDiscordCommands'
import { createAdminClient } from '@/lib/supabase/admin'
import { consumeServerRateLimit } from '@/lib/serverRateLimit'

export const revalidate = 0

// Discord POSTs every slash-command invocation here (an "Interaction") —
// this is the whole bot for anything that doesn't need a persistent Gateway
// connection: no separate always-on process, just another Vercel route.
// Registered command definitions live in registerGlobalCommands (see
// /api/admin/discord/register-commands) and must match the `name` switch
// below exactly, or Discord will show the command but this route won't
// recognize it.
export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature-ed25519')
  const timestamp = req.headers.get('x-signature-timestamp')
  if (!verifyDiscordSignature(signature, timestamp, rawBody)) {
    return new NextResponse('invalid request signature', { status: 401 })
  }

  let body
  try { body=JSON.parse(rawBody) } catch { return new NextResponse('invalid interaction', {status:400}) }
  if(body.application_id!==process.env.DISCORD_APPLICATION_ID)return new NextResponse('invalid application',{status:401})

  // type 1 = PING — Discord sends this once when you save the Interactions
  // Endpoint URL in the dev portal, to confirm it's live before it'll let
  // you save it. Must be answered with a bare {type: 1}.
  if (body.type === 1) return NextResponse.json({ type: 1 })

  // type 2 = an actual slash command invocation.
  if (body.type === 2) {
    const name = body.data?.name as string

    if (CREATOR_DISCORD_COMMANDS.some(command=>command.name===name)) {
      // Acknowledge privately inside Discord's 3-second limit before any membership/provider call.
      after(async()=>{
        try{
          const discordId=body.member?.user?.id||body.user?.id
          const rate=await consumeServerRateLimit(discordCommandRateKey(String(discordId)),'creator_discord_command',20,3600)
          if(!rate.available||!rate.allowed){await editDeferredReply(body.application_id,body.token,{content:'Please wait before checking your Discord access again.'});return}
          const result=await creatorDiscordCommand(createAdminClient(),body.guild_id,discordId,name)
          await editDeferredReply(body.application_id,body.token,result)
        }catch{await editDeferredReply(body.application_id,body.token,{content:'Your community connection could not be checked. Please try again or open SlipSurge.'})}
      })
      return NextResponse.json({type:5,data:{flags:64}})
    }

    if (name === 'slate') {
      if (MLB_HIBERNATING) return NextResponse.json({ type: 4, data: { flags: 64, content: 'This command is currently unavailable.' } })
      // getTodaysMatchups hits MLB's live schedule/lineup endpoints —
      // comfortably over Discord's 3s ack budget, so defer (type 5) and
      // edit the reply once the real data's back.
      after(async () => {
        const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        const games = await getTodaysMatchups(date)
        if (!games.length) {
          await editDeferredReply(body.application_id, body.token, { content: 'No MLB games found for today.' })
          return
        }
        const fields = games.map(g => ({
          name: `${g.awayAbbr} @ ${g.homeAbbr}`,
          value: [
            `${g.awayPitcher?.name ?? 'TBD'} (${g.awayPitcher?.hand ?? '?'}) vs ${g.homePitcher?.name ?? 'TBD'} (${g.homePitcher?.hand ?? '?'})`,
            g.status,
          ].join('\n'),
          inline: true,
        }))
        await editDeferredReply(body.application_id, body.token, {
          embeds: [{
            title: `Today's Slate — ${date}`,
            url: `${PLATFORM_URL}/dugout?date=${date}`,
            color: 0xB4FF4D,
            fields,
          }],
        })
      })
      return NextResponse.json({ type: 5 })
    }

    return NextResponse.json({ type: 4, data: { flags: 64, content: `Unknown command: ${name}` } })
  }

  return NextResponse.json({ type: 4, data: { flags: 64, content: 'Unsupported interaction type.' } })
}
