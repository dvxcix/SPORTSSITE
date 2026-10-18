import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getDiscordConfig } from '@/lib/discord'
import { PLATFORM_URL } from '@/lib/platform'

export const revalidate = 0
export const maxDuration = 60

type SlateGame = {
  gameDate: string
  teams: {
    away: { team: { name: string }; probablePitcher?: { fullName: string } }
    home: { team: { name: string }; probablePitcher?: { fullName: string } }
  }
}

// Read only the schedule fields used in this digest. Full lineup/roster
// enrichment made this alert exceed its old 30-second budget. Delivery uses
// the existing retry worker and a durable date claim, never a direct send here.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const config = await getDiscordConfig(admin)
  if (!config?.enabled || !config.alert_channels?.slate) return NextResponse.json({ ok: true, skipped: 'not-configured' })
  const schedule = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`, {
    signal: AbortSignal.timeout(12_000), cache: 'no-store',
  })
  if (!schedule.ok) throw Object.assign(new Error(`MLB slate schedule returned HTTP ${schedule.status}`), { code: `MLB_SCHEDULE_HTTP_${schedule.status}` })
  const body = await schedule.json()
  if (!Array.isArray(body.dates) || body.dates.some((day: { games?: unknown }) => !Array.isArray(day.games))) {
    throw Object.assign(new Error('MLB slate schedule returned malformed data'), { code: 'MLB_SCHEDULE_INVALID' })
  }
  const games: SlateGame[] = body.dates.flatMap((day: { games: SlateGame[] }) => day.games)
  if (games.some(game => !Number.isFinite(Date.parse(game.gameDate)) || !game.teams?.away?.team?.name || !game.teams?.home?.team?.name)) {
    throw Object.assign(new Error('MLB slate schedule returned malformed games'), { code: 'MLB_SCHEDULE_INVALID' })
  }
  if (!games.length) return NextResponse.json({ ok: true, games: 0 })

  const lines = games
    .slice()
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    .map(g => {
      const time = new Date(g.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
      const away = g.teams.away.probablePitcher?.fullName ?? 'TBD'
      const home = g.teams.home.probablePitcher?.fullName ?? 'TBD'
      return `**${g.teams.away.team.name} @ ${g.teams.home.team.name}** — ${time} ET\n${away} vs ${home}`
    })

  const { data: queued, error } = await admin.rpc('queue_daily_slate_alert', {
    p_date: date,
    p_channel_id: config.alert_channels.slate,
    p_payload: {
      embeds: [{
        title: `Today's MLB Slate — ${games.length} game${games.length === 1 ? '' : 's'}`,
        description: lines.join('\n\n'),
        url: `${PLATFORM_URL}/dugout?date=${date}`,
        color: 0xB4FF4D,
      }],
    },
  })
  if (error) throw Object.assign(new Error('Daily slate delivery could not be queued'), { code: 'DAILY_SLATE_QUEUE_FAILED' })

  return NextResponse.json({ ok: true, games: games.length, queued: queued === true, alreadyQueued: queued === false })
}

export const GET = withPipelineHealth('slate-drop', run)
