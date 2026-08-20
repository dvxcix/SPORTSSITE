import { after, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { getTeamLogoPngUrl, getTeamName } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { fetchHrFeed } from '@/lib/hrFeed'
import { postAlert } from '@/lib/discord'
import { PLATFORM_URL } from '@/lib/platform'
import { withPipelineHealth } from '@/lib/pipelineHealth'
import { homeRunAlertEvent } from '@/lib/contactAlertEvents'
import { enqueueContactAlert, processContactAlertJobs } from '@/lib/contactAlertOutbox'

export const revalidate = 0
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
export const GET = withPipelineHealth('hr-alerts', run)

// Every minute (see vercel.json) while games are live — pulls the exact same
// HR feed the Dugout page itself reads (fetchHrFeed, @/lib/hrFeed) and posts
// any home run this run hasn't seen before to Discord. Diffed against
// hr_alert_state (game_pk, ab_index) so a HR only ever posts once, same
// diff-against-last-run-state pattern as lineup-confirmed.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ ok: true, games: 0, newHrs: 0 })

  const { hrFeed, contactFeed, failures } = await fetchHrFeed(games.map(g => ({ gamePk: g.gamePk, status: { abstractGameState: g.abstractStatus } })))
  if (!hrFeed.length) return NextResponse.json({ ok: true, games: games.length, newHrs: 0 })

  const { data: alreadyAlerted } = await admin.from('hr_alert_state').select('game_pk,ab_index').in('game_pk', games.map(g => g.gamePk))
  const alertedKeys = new Set((alreadyAlerted ?? []).map(r => `${r.game_pk}-${r.ab_index}`))

  const newHrs = hrFeed.filter(h => !alertedKeys.has(`${h.game_pk}-${h.ab_index}`))
  const queued: Array<{ id: string; created: boolean }> = []
  let posted = 0
  for (const hr of newHrs) {
    const gameIndex = games.findIndex(game => game.gamePk === hr.game_pk)
    if (gameIndex < 0) continue
    const game = games[gameIndex]
    const event = homeRunAlertEvent(hr, game, gameIndex, date, contactFeed)
    const job = await enqueueContactAlert(event, 'hr-alerts-cron')
    queued.push({ id: job.id, created: job.created })
    // The legacy text-only block below remains compile-safe during rollout,
    // but durable media delivery replaces it and prevents a duplicate post.
    continue
    // Home team bats in the bottom half, away in the top — same derivation
    // lineup-confirmed has no need for (it already knows the side per
    // broadcast) but a bare playByPlay event only carries half/inning.
    const abbr = hr.half === 'bottom' ? game.homeAbbr : game.awayAbbr

    const details = [
      hr.hit_distance != null ? `${Math.round(Number(hr.hit_distance))} ft` : null,
      hr.exit_velocity != null ? `${Number(hr.exit_velocity).toFixed(1)} mph EV` : null,
      // @ts-expect-error Legacy text-only block is unreachable during the media-alert rollout.
      hr.launch_angle != null ? `${Math.round(hr.launch_angle)}° LA` : null,
      hr.inning != null ? `${hr.half === 'bottom' ? 'Bot' : 'Top'} ${hr.inning}` : null,
      hr.pitcher_name ? `Off ${hr.pitcher_name}` : null,
    ].filter(Boolean).join(' • ')
    const oddsLine = undefined

    await postAlert(admin, 'hr', {
      embeds: [{
        author: { name: getTeamName(abbr), icon_url: getTeamLogoPngUrl(abbr) },
        title: `${hr.player_name} — Home Run!`,
        description: [details, oddsLine].filter(Boolean).join('\n'),
        url: `${PLATFORM_URL}/dugout?date=${date}`,
        color: 0xB4FF4D,
        thumbnail: { url: mlbHeadshot(hr.mlb_id ?? 0) },
      }],
    })
    posted++
  }

  if (newHrs.length) {
    await admin.from('hr_alert_state')
      .upsert(newHrs.map(h => ({ game_pk: h.game_pk, ab_index: h.ab_index })), { onConflict: 'game_pk,ab_index', ignoreDuplicates: true })
  }

  if (queued.length) after(() => processContactAlertJobs(queued.map(job => job.id)))

  return NextResponse.json({ ok: true, games: games.length, newHrs: newHrs.length, queued: queued.length, posted, feedFailures: failures })
}
