import { NextResponse } from 'next/server'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { postAlert } from '@/lib/discord'
import { PLATFORM_URL } from '@/lib/platform'

export const revalidate = 0
export const maxDuration = 30

// Once daily (see vercel.json, mid-morning ET — early enough to be useful
// pregame, late enough that probable pitchers are usually locked in). Posts
// one embed listing every real MLB game today with its first-pitch time and
// probable starters — a plain daily digest, not a diff-against-state alert
// like lineup-confirmed/hr-alerts, so there's no "already posted" tracking
// needed: it only ever runs once a day.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ ok: true, games: 0 })

  const lines = games
    .slice()
    .sort((a, b) => new Date(a.gameDate).getTime() - new Date(b.gameDate).getTime())
    .map(g => {
      const time = new Date(g.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
      const away = g.awayPitcher ? `${g.awayPitcher.name} (${g.awayPitcher.hand})` : 'TBD'
      const home = g.homePitcher ? `${g.homePitcher.name} (${g.homePitcher.hand})` : 'TBD'
      return `**${g.awayTeam} @ ${g.homeTeam}** — ${time} ET\n${away} vs ${home}`
    })

  await postAlert(admin, 'slate', {
    embeds: [{
      title: `Today's MLB Slate — ${games.length} game${games.length === 1 ? '' : 's'}`,
      description: lines.join('\n\n'),
      url: `${PLATFORM_URL}/dugout?date=${date}`,
      color: 0xB4FF4D,
    }],
  })

  return NextResponse.json({ ok: true, games: games.length })
}

export const GET = withPipelineHealth('slate-drop', run)
