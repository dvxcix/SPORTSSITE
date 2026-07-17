import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@/lib/mlbSchedule'
import { getTeamLogoUrl, getTeamName } from '@/lib/mlbTeamColors'

export const revalidate = 0
export const maxDuration = 60

// Runs every 5 minutes (see vercel.json) all day — lineups can post anywhere
// from early morning (day games) to a couple hours before a late start, so
// there's no single "pregame window" worth special-casing; the underlying
// MLB call and DB diff are both cheap enough to just poll continuously.
//
// lineup_confirmation_state holds the last-seen confirmed/projected value
// per (game_pk, side) so this can detect the ONE moment a lineup flips from
// projected to confirmed and fire a notification exactly once, instead of
// re-notifying on every run for the rest of the day. game_pk (not a
// team-abbreviation key) is the natural disambiguator for a doubleheader's
// two legs — MLB gives each leg its own gamePk already.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ ok: true, games: 0, transitions: 0, notified: 0 })

  const { data: stateRows } = await admin
    .from('lineup_confirmation_state')
    .select('game_pk, side, confirmed')
    .in('game_pk', games.map(g => g.gamePk))
  const stateByKey = new Map<string, boolean>()
  for (const r of stateRows ?? []) stateByKey.set(`${r.game_pk}-${r.side}`, r.confirmed)

  let transitions = 0
  let notified = 0
  const upserts: { game_pk: number; side: 'home' | 'away'; team_abbr: string; confirmed: boolean }[] = []

  for (const g of games) {
    const sides: { side: 'home' | 'away'; abbr: string; confirmed: boolean }[] = [
      { side: 'home', abbr: g.homeAbbr, confirmed: g.homeLineupConfirmed },
      { side: 'away', abbr: g.awayAbbr, confirmed: g.awayLineupConfirmed },
    ]
    for (const s of sides) {
      const key = `${g.gamePk}-${s.side}`
      const prev = stateByKey.get(key)
      upserts.push({ game_pk: g.gamePk, side: s.side, team_abbr: s.abbr, confirmed: s.confirmed })
      // Only a real false->true flip fires a notification — a brand-new row
      // (prev === undefined) just establishes today's baseline, since we
      // can't tell whether we're seeing it for the first time because it
      // JUST confirmed or because this cron only just started polling.
      if (prev === false && s.confirmed === true) {
        transitions++
        notified += await notifyTeamFollowers(admin, s.abbr, date)
      }
    }
  }

  if (upserts.length) {
    await admin.from('lineup_confirmation_state').upsert(upserts, { onConflict: 'game_pk,side' })
  }

  return NextResponse.json({ ok: true, games: games.length, transitions, notified })
}

async function notifyTeamFollowers(admin: ReturnType<typeof createAdminClient>, abbr: string, date: string): Promise<number> {
  const { data: users } = await admin
    .from('users')
    .select('id')
    .contains('favorite_teams', [abbr])
  if (!users?.length) return 0

  const teamName = getTeamName(abbr)
  const teamLogo = getTeamLogoUrl(abbr)
  const rows = users.map(u => ({
    user_id: u.id,
    type: 'lineup_confirmed',
    message: `${teamName} — Batting Lineup Confirmed`,
    link: `/dugout?date=${date}`,
    data: teamLogo ? { avatar_url: teamLogo } : null,
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) { console.error('[lineup-confirmed] notify insert failed', { abbr, error }); return 0 }
  return rows.length
}
