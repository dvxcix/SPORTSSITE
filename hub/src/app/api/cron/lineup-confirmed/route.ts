import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups, isPregame, type LineupPlayer } from '@/lib/mlbSchedule'
import { getTeamLogoUrl, getTeamName } from '@/lib/mlbTeamColors'

export const revalidate = 0
export const maxDuration = 60

type Admin = ReturnType<typeof createAdminClient>

// Runs every 5 minutes (see vercel.json) all day — lineups can post anywhere
// from early morning (day games) to a couple hours before a late start, so
// there's no single "pregame window" worth special-casing; the underlying
// MLB call and DB diffs are both cheap enough to just poll continuously.
//
// Three independent things get watched per run, each diffed against the
// PREVIOUS run's stored state so a notification fires exactly once at the
// moment something actually changes, not on every poll for the rest of the
// day:
//   1. A lineup going from projected -> confirmed.
//   2. A CONFIRMED lineup's actual roster changing (a late scratch/swap) —
//      distinct from #1, since the lineup was already "confirmed" once.
//   3. A game's status becoming postponed/delayed/suspended/cancelled.
//
// This is a site-wide broadcast, not personal activity tied to a specific
// user's team — every MLB game today is in scope for every user who has
// this notification type enabled (default on, same as every other type;
// see users.notification_settings), not just teams they favorited.
export async function GET(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)
  if (!games.length) return NextResponse.json({ ok: true, games: 0, lineupEvents: 0, statusEvents: 0, notified: 0 })

  const [{ data: lineupStateRows }, { data: statusStateRows }, { data: allUsers }] = await Promise.all([
    admin.from('lineup_confirmation_state').select('game_pk, side, confirmed, lineup_signature').in('game_pk', games.map(g => g.gamePk)),
    admin.from('game_status_state').select('game_pk, status').in('game_pk', games.map(g => g.gamePk)),
    // Fetched once per run (not once per event) — anyone who hasn't
    // explicitly disabled push for this type, matching the push-default-ON
    // convention every other notification type uses (see
    // NotificationSettingsForm). This is a broadcast, not personal
    // activity, so — unlike follow/comment/etc, which always insert — an
    // explicit opt-out means no row at all, not just no push.
    admin.from('users').select('id, notification_settings'),
  ])
  const recipientIds = (allUsers ?? [])
    .filter(u => ((u.notification_settings as Record<string, boolean> | null) ?? {}).lineup_confirmed !== false)
    .map(u => u.id)
  const lineupStateByKey = new Map<string, { confirmed: boolean; lineup_signature: string | null }>()
  for (const r of lineupStateRows ?? []) lineupStateByKey.set(`${r.game_pk}-${r.side}`, { confirmed: r.confirmed, lineup_signature: r.lineup_signature })
  const statusByGamePk = new Map<number, string>()
  for (const r of statusStateRows ?? []) statusByGamePk.set(r.game_pk, r.status)

  let lineupEvents = 0
  let statusEvents = 0
  let notified = 0
  const lineupUpserts: { game_pk: number; side: 'home' | 'away'; team_abbr: string; confirmed: boolean; lineup_signature: string | null }[] = []
  const statusUpserts: { game_pk: number; status: string }[] = []
  const scrapeQueueInserts: { game_pk: number; ready_at: string }[] = []

  for (const g of games) {
    const sides: { side: 'home' | 'away'; abbr: string; confirmed: boolean; lineup: LineupPlayer[] }[] = [
      { side: 'home', abbr: g.homeAbbr, confirmed: g.homeLineupConfirmed, lineup: g.homeLineup },
      { side: 'away', abbr: g.awayAbbr, confirmed: g.awayLineupConfirmed, lineup: g.awayLineup },
    ]

    // The FIRST moment both lineups for this game go confirmed is roughly
    // when books' First Home Run market actually appears (~5 min behind) —
    // queue a scrape for dispatch-scrapes to pick up then, rather than
    // relying only on the coarse fixed-schedule sweep. Only fires once per
    // game per day (checked against PREVIOUS run's state, and the queue
    // insert itself is a no-op on conflict) — a later lineup change
    // (scratch/swap) doesn't re-trigger it.
    const wasFullyConfirmed = (lineupStateByKey.get(`${g.gamePk}-home`)?.confirmed ?? false) && (lineupStateByKey.get(`${g.gamePk}-away`)?.confirmed ?? false)
    const isFullyConfirmedNow = g.homeLineupConfirmed && g.awayLineupConfirmed
    if (!wasFullyConfirmed && isFullyConfirmedNow && isPregame(g.status)) {
      scrapeQueueInserts.push({ game_pk: g.gamePk, ready_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() })
    }
    for (const s of sides) {
      const key = `${g.gamePk}-${s.side}`
      const prev = lineupStateByKey.get(key)
      const signature = s.confirmed ? lineupSignature(s.lineup) : null
      lineupUpserts.push({ game_pk: g.gamePk, side: s.side, team_abbr: s.abbr, confirmed: s.confirmed, lineup_signature: signature })

      if (!prev) continue // brand-new row — just establishes today's baseline, no event

      if (!prev.confirmed && s.confirmed) {
        lineupEvents++
        notified += await broadcast(admin, recipientIds, `${getTeamName(s.abbr)} — Batting Lineup Confirmed`, `/dugout?date=${date}`, getTeamLogoUrl(s.abbr))
      } else if (prev.confirmed && s.confirmed && prev.lineup_signature && signature && prev.lineup_signature !== signature) {
        lineupEvents++
        const change = describeLineupChange(prev.lineup_signature, signature, s.lineup)
        notified += await broadcast(admin, recipientIds, `${getTeamName(s.abbr)} — Lineup Change${change ? `: ${change}` : ''}`, `/dugout?date=${date}`, getTeamLogoUrl(s.abbr))
      }
    }

    const prevStatus = statusByGamePk.get(g.gamePk)
    statusUpserts.push({ game_pk: g.gamePk, status: g.status })
    if (prevStatus && prevStatus !== g.status && isNotableStatus(g.status)) {
      statusEvents++
      notified += await broadcast(admin, recipientIds, `${g.awayTeam} @ ${g.homeTeam} — Game ${g.status}`, `/dugout?date=${date}`, undefined)
    }
  }

  if (lineupUpserts.length) await admin.from('lineup_confirmation_state').upsert(lineupUpserts, { onConflict: 'game_pk,side' })
  if (statusUpserts.length) await admin.from('game_status_state').upsert(statusUpserts, { onConflict: 'game_pk' })
  if (scrapeQueueInserts.length) await admin.from('scrape_dispatch_queue').upsert(scrapeQueueInserts, { onConflict: 'game_pk', ignoreDuplicates: true })

  return NextResponse.json({ ok: true, games: games.length, lineupEvents, statusEvents, notified, scrapesQueued: scrapeQueueInserts.length })
}

const lineupSignature = (lineup: LineupPlayer[]) => lineup.map(p => p.mlb_id).sort((a, b) => a - b).join(',')

// A status change only matters if it's one of these — the normal pregame
// progression (Scheduled -> Pre-Game -> Warmup -> In Progress -> Final) is
// not noteworthy and would otherwise fire on nearly every game, every day.
const isNotableStatus = (status: string) => /postpon|delay|suspend|cancel/i.test(status)

// Names the specific player(s) that changed when it's a clean 1-for-1 swap
// (the common case — a late scratch); falls back to a generic message for
// anything messier (a full lineup reshuffle) rather than guessing wrong.
function describeLineupChange(prevSig: string, nextSig: string, nextLineup: LineupPlayer[]): string | null {
  const prevIds = new Set(prevSig.split(',').filter(Boolean).map(Number))
  const nextIds = new Set(nextSig.split(',').filter(Boolean).map(Number))
  const added = [...nextIds].filter(id => !prevIds.has(id))
  const removed = [...prevIds].filter(id => !nextIds.has(id))
  if (added.length === 1 && removed.length === 1) {
    const inName = nextLineup.find(p => p.mlb_id === added[0])?.name
    if (inName) return `${inName} added to the lineup`
  }
  return null
}

async function broadcast(admin: Admin, recipientIds: string[], message: string, link: string, teamLogo: string | undefined): Promise<number> {
  if (!recipientIds.length) return 0
  const rows = recipientIds.map(id => ({
    user_id: id,
    type: 'lineup_confirmed',
    message,
    link,
    data: teamLogo ? { avatar_url: teamLogo } : null,
  }))
  const { error } = await admin.from('notifications').insert(rows)
  if (error) { console.error('[lineup-confirmed] broadcast insert failed', { message, error }); return 0 }
  return rows.length
}
