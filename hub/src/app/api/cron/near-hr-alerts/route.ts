import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronAuth } from '@/lib/cron-auth'
import { getTodaysMatchups } from '@slipsurge/core/mlbSchedule'
import { getTeamLogoPngUrl, getTeamName } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { postAlert } from '@/lib/discord'
import { PLATFORM_URL } from '@/lib/stripe'
import { withPipelineHealth } from '@/lib/pipelineHealth'

export const revalidate = 0
export const maxDuration = 60
export const GET = withPipelineHealth('near-hr-alerts', run)

// mlb-party Supabase — same external scraper source Dugout's own "Today's
// Near Home Runs" panel reads (near_hrs), fetched the same minimal way every
// other route in this codebase that touches it does (dugout/data/route.ts,
// api/allstar/data/route.ts, etc. each keep their own small copy rather than
// share one — matching that existing convention here).
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }
async function mpGet(path: string): Promise<any[]> {
  try {
    const res = await fetch(`${MP_URL}${path}`, { headers: mpH })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// Every minute (see vercel.json) — near_hrs has no per-row id, so new rows
// are detected purely by captured_at (the moment the external scraper picked
// them up) advancing past a per-date cursor, same idea as a Kafka offset.
// The FIRST run seen for a given date only establishes the cursor and posts
// nothing — otherwise every near-HR already sitting in the table from
// earlier today would flood Discord the moment this cron first deploys.
async function run(req: Request) {
  const authError = requireCronAuth(req)
  if (authError) return authError

  const admin = createAdminClient()
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const games = await getTodaysMatchups(date)

  const teamByMlbId: Record<number, { team: string; gamePk: number }> = {}
  for (const g of games) {
    for (const p of [...g.homeLineup, ...g.awayLineup]) {
      if (p.mlb_id) teamByMlbId[p.mlb_id] = { team: p.team, gamePk: g.gamePk }
    }
  }

  const rows = await mpGet(
    `/rest/v1/near_hrs?game_date=eq.${date}&select=batter_name,batter_id,pitcher_name,exit_velocity,launch_angle,hit_distance,inning,half_inning,captured_at&order=captured_at.asc`
  )
  if (!rows.length) return NextResponse.json({ ok: true, rows: 0, newRows: 0 })

  const { data: cursorRow } = await admin.from('near_hr_alert_cursor').select('last_captured_at').eq('game_date', date).maybeSingle()
  const lastSeen = cursorRow ? new Date(cursorRow.last_captured_at).getTime() : null
  const maxCapturedAt = rows.reduce((max, r) => Math.max(max, new Date(r.captured_at).getTime()), 0)

  let posted = 0
  if (lastSeen !== null) {
    const newRows = rows.filter(r => new Date(r.captured_at).getTime() > lastSeen)
    for (const n of newRows) {
      const teamInfo = n.batter_id ? teamByMlbId[n.batter_id] : undefined
      const details = [
        n.hit_distance != null ? `${Math.round(n.hit_distance)} ft` : null,
        n.exit_velocity != null ? `${Number(n.exit_velocity).toFixed(1)} mph EV` : null,
        n.launch_angle != null ? `${Math.round(n.launch_angle)}° LA` : null,
        n.inning != null ? `${n.half_inning === 'bottom' ? 'Bot' : 'Top'} ${n.inning}` : null,
        n.pitcher_name ? `Off ${n.pitcher_name}` : null,
      ].filter(Boolean).join(' • ')

      await postAlert(admin, 'near_hr', {
        embeds: [{
          ...(teamInfo ? { author: { name: getTeamName(teamInfo.team), icon_url: getTeamLogoPngUrl(teamInfo.team) } } : {}),
          title: `${n.batter_name} — Near Home Run`,
          description: details || undefined,
          url: `${PLATFORM_URL}/dugout?date=${date}`,
          color: 0xFFB84D,
          thumbnail: n.batter_id ? { url: mlbHeadshot(n.batter_id) } : undefined,
        }],
      })
      posted++
    }
  }

  await admin.from('near_hr_alert_cursor').upsert({ game_date: date, last_captured_at: new Date(maxCapturedAt).toISOString() }, { onConflict: 'game_date' })

  return NextResponse.json({ ok: true, rows: rows.length, newRows: lastSeen === null ? 0 : posted, firstRun: lastSeen === null, posted })
}
