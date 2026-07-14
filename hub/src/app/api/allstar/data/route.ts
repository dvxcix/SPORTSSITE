import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 0
export const maxDuration = 60

// 2026 MLB All-Star Game — Citizens Bank Park, Philadelphia. gamePk is real,
// confirmed via statsapi.mlb.com/api/v1/schedule?sportId=1&gameType=A for
// 2026-07-14 (AL team id 159 vs NL team id 160). Hardcoded since this is a
// one-night page for a single known event, not a recurring schedule lookup.
const ASG_GAME_PK = 823443

// ── mlb-party Supabase (same Statcast source The Dugout itself reads) ──────
const MP_URL = 'https://emllcbynioctxkbsdlwp.supabase.co'
const MP_KEY = process.env.MLB_PARTY_SERVICE_ROLE_KEY!
const mpH = { apikey: MP_KEY, Authorization: `Bearer ${MP_KEY}`, 'Content-Type': 'application/json' }

async function mpGet(path: string, range?: string): Promise<any[]> {
  try {
    const headers = range ? { ...mpH, Range: range } : mpH
    const res = await fetch(`${MP_URL}${path}`, { headers, cache: 'no-store' })
    if (!res.ok) return []
    const d = await res.json()
    return Array.isArray(d) ? d : []
  } catch { return [] }
}

// Same 1000-row PostgREST cap other routes in this app already work around
// (see /api/dugout/data) — a Range header doesn't bypass it, only paging
// until a short page proves the end does.
async function mpGetAll(path: string): Promise<any[]> {
  const PAGE = 1000
  const out: any[] = []
  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const page = await mpGet(path, `${offset}-${offset + PAGE - 1}`)
    out.push(...page)
    if (page.length < PAGE) break
  }
  return out
}

const STAT_COLS = 'mlb_id,name_norm,pitch_hand,win,avg_bat_speed,hard_swing_rate,squared_up_per_swing,blast_per_swing,swing_length,attack_angle,ideal_attack_angle_rate,swing_tilt,exit_velocity_avg,launch_angle_avg,barrel_batted_rate,hard_hit_pct,pull_air_rate,fb_rate,xhr,hr_total,avg_hr_distance'
const TIME_COLS = 'mlb_id,name_norm,pitch_hand,pitch_type,win,miss_distance,on_time_percent,n_swings'

export async function GET() {
  // 1. Real live game feed — boxscore.teams.{away,home}.players already
  // carries the full announced All-Star roster (confirmed: 32-33 players per
  // side) even pregame, since MLB publishes full ASG rosters well ahead of
  // first pitch, unlike a normal game's 26-man active roster.
  let feed: any = null
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1.1/game/${ASG_GAME_PK}/feed/live`, {
      cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
    })
    if (res.ok) feed = await res.json()
  } catch {}

  if (!feed) {
    return NextResponse.json({ error: 'Could not load All-Star Game data from MLB Stats API' }, { status: 502 })
  }

  const boxTeams = feed.liveData?.boxscore?.teams ?? {}
  const gameData = feed.gameData ?? {}
  const venue = gameData.venue?.name ?? ''
  const gameDate = gameData.datetime?.dateTime ?? ''
  const probablePitchers = gameData.probablePitchers ?? {}

  const sideMeta: Record<'away' | 'home', { league: 'AL' | 'NL'; teamName: string }> = {
    away: { league: 'AL', teamName: gameData.teams?.away?.name ?? 'American League All-Stars' },
    home: { league: 'NL', teamName: gameData.teams?.home?.name ?? 'National League All-Stars' },
  }

  const rawPlayersBySide: Record<string, any[]> = {}
  const allIds: number[] = []
  for (const side of ['away', 'home'] as const) {
    const players = Object.values(boxTeams[side]?.players ?? {}) as any[]
    rawPlayersBySide[side] = players
    for (const p of players) if (p.person?.id) allIds.push(p.person.id)
  }

  // 2. Person details — the boxscore's own `person` objects carry no
  // batSide/pitchHand/currentTeam at all (confirmed live), so every hand
  // split and team-logo lookup needs a real batch fetch of the people
  // endpoint, same pattern /api/dugout/data already uses for confirmed
  // lineups.
  const peopleById = new Map<number, any>()
  if (allIds.length) {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${allIds.join(',')}&hydrate=currentTeam`,
        { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } }
      )
      if (res.ok) {
        const people = (await res.json()).people ?? []
        for (const person of people) peopleById.set(person.id, person)
      }
    } catch {}
  }

  const rosters: Record<'AL' | 'NL', any[]> = { AL: [], NL: [] }
  for (const side of ['away', 'home'] as const) {
    const league = sideMeta[side].league
    for (const p of rawPlayersBySide[side]) {
      const person = peopleById.get(p.person.id)
      if (!person) continue
      rosters[league].push({
        mlb_id: person.id,
        name: person.fullName,
        jersey: p.jerseyNumber ?? person.primaryNumber ?? '',
        position: p.position?.abbreviation || person.primaryPosition?.abbreviation || '?',
        bats: person.batSide?.code || '?',
        throws: person.pitchHand?.code || '?',
        teamId: person.currentTeam?.id ?? null,
        teamName: person.currentTeam?.name ?? '',
        league,
      })
    }
  }

  const allMlbIds = [...rosters.AL, ...rosters.NL].map(p => p.mlb_id)
  const idFilter = allMlbIds.length ? `&mlb_id=in.(${allMlbIds.join(',')})` : ''

  // 3. Real Statcast bat-tracking + timing splits — same tables/columns The
  // Dugout itself reads for a normal game, just scoped to tonight's 65
  // rostered All-Stars instead of a slate's confirmed lineups.
  const [statSplits, timingSplits, pitcherSplits] = await Promise.all([
    mpGetAll(`/rest/v1/batter_statcast_splits?select=${STAT_COLS}${idFilter}`),
    mpGetAll(`/rest/v1/batter_timing_splits?select=${TIME_COLS}${idFilter}`),
    allMlbIds.length ? mpGet(`/rest/v1/pitcher_statcast_splits?mlb_id=in.(${allMlbIds.join(',')})&select=*`) : Promise.resolve([]),
  ])

  // 4. Real scraped FanDuel/BetMGM/Caesars markets — a DB table, not
  // committed source (this repo is public, so vendor odds data can't live
  // in a checked-in file the way the hand-transcribed HR Derby board did).
  let markets: any[] = []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('allstar_event_markets')
      .select('id, book, section, title, options')
      .eq('snapshot', 'current')
    markets = data ?? []
  } catch {}

  return NextResponse.json(
    {
      gamePk: ASG_GAME_PK,
      venue,
      gameDate,
      probablePitchers,
      rosters,
      statSplits,
      timingSplits,
      pitcherSplits,
      markets,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } }
  )
}
