import type { createAdminClient } from '@/lib/supabase/admin'

// Free NFL data foundation — nflverse (nflreadr's underlying source) publishes
// static CSV/parquet files as GitHub release assets, refreshed nightly during
// the season, rather than a queryable live API. Unlike MLB's per-player
// playerSync.ts job queue (mlb-sync-bio etc., one HTTP call per player), each
// of these is a single bulk file covering every team/player/game at once —
// no queue/claim machinery needed, just fetch → parse → chunked upsert.
const RELEASE_BASE = 'https://github.com/nflverse/nflverse-data/releases/download'

// Same minimal-but-correct CSV parser as savantSync.ts's parseCsv — handles
// quoted fields containing commas/escaped quotes, which these files do use
// (e.g. team_logo_wikipedia URLs, player college names with commas). Kept as
// its own copy rather than importing savantSync.ts's version so this file
// has no dependency on baseball-specific code.
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length > 0)
  if (!lines.length) return []
  const parseLine = (line: string): string[] => {
    const fields: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false }
        } else cur += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ',') { fields.push(cur); cur = '' }
        else cur += ch
      }
    }
    fields.push(cur)
    return fields
  }
  const header = parseLine(lines[0])
  return lines.slice(1).map(line => {
    const values = parseLine(line)
    const row: Record<string, string> = {}
    header.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

async function fetchNflverseCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) throw new Error(`nflverse CSV ${res.status}: ${url} :: ${text.slice(0, 300)}`)
  return parseCsv(text)
}

const s = (v: string | undefined): string | null => (v != null && v !== '' ? v : null)
const n = (v: string | undefined): number | null => {
  if (v == null || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const b = (v: string | undefined): boolean | null => {
  if (v == null || v === '') return null
  return v === '1' || v.toLowerCase() === 'true'
}

async function upsertChunked(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<number> {
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict })
    if (error) throw error
  }
  return rows.length
}

// 32 rows, effectively static reference data (colors/logos/division rarely
// change) — safe to fully re-upsert every run.
export async function syncNflTeams(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/teams/teams_colors_logos.csv`)
  const mapped = rows.map(r => ({
    team_abbr: r.team_abbr,
    team_name: r.team_name,
    team_id: s(r.team_id),
    team_nick: s(r.team_nick),
    team_conf: s(r.team_conf),
    team_division: s(r.team_division),
    team_color: s(r.team_color),
    team_color2: s(r.team_color2),
    team_color3: s(r.team_color3),
    team_color4: s(r.team_color4),
    team_logo_espn: s(r.team_logo_espn),
    team_logo_wikipedia: s(r.team_logo_wikipedia),
    team_wordmark: s(r.team_wordmark),
    team_logo_squared: s(r.team_logo_squared),
    updated_at: new Date().toISOString(),
  })).filter(r => r.team_abbr)
  return upsertChunked(admin, 'nfl_teams', mapped, 'team_abbr')
}

// players.csv covers every player in nflverse's history (~25k+ rows) —
// still a single file, just a bigger chunked upsert. gsis_id is the stable
// primary key nflverse uses everywhere else (pbp, rosters, NGS), and the
// file already includes the espn_id/pfr_id/nfl_id crosswalk directly, so no
// separate load_ff_playerids() fetch is needed for basic cross-referencing.
export async function syncNflPlayers(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/players/players.csv`)
  const mapped = rows.map(r => ({
    gsis_id: r.gsis_id,
    display_name: r.display_name,
    first_name: s(r.first_name),
    last_name: s(r.last_name),
    short_name: s(r.short_name),
    football_name: s(r.football_name),
    position_group: s(r.position_group),
    position: s(r.position),
    height: n(r.height),
    weight: n(r.weight),
    headshot: s(r.headshot),
    college_name: s(r.college_name),
    jersey_number: n(r.jersey_number),
    birth_date: s(r.birth_date),
    rookie_season: n(r.rookie_season),
    last_season: n(r.last_season),
    latest_team: s(r.latest_team),
    status: s(r.status),
    years_of_experience: n(r.years_of_experience),
    draft_year: n(r.draft_year),
    draft_round: n(r.draft_round),
    draft_pick: n(r.draft_pick),
    draft_team: s(r.draft_team),
    espn_id: s(r.espn_id),
    pfr_id: s(r.pfr_id),
    nfl_id: s(r.nfl_id),
    updated_at: new Date().toISOString(),
  })).filter(r => r.gsis_id)
  return upsertChunked(admin, 'nfl_players', mapped, 'gsis_id')
}

// games.csv covers every game back to 1999 — a full historical backfill is
// one fetch; in-season, re-running this same sync picks up final
// scores/results as they're published (nflverse republishes the whole file
// nightly, so this cron just re-upserts on top of whatever's already there,
// same self-healing shape as the Statcast precompute crons' PAST_DAYS
// reprocessing). Deliberately omits nflverse's own moneyline/spread/total
// columns — this site already has its own real-time odds pipeline
// (FanDuel/BetMGM/Pikkit scrapers), and a stale historical closing line from
// a third-party CSV would only ever be noise next to that.
export async function syncNflSchedule(admin: ReturnType<typeof createAdminClient>, sinceSeason?: number): Promise<number> {
  const rows = await fetchNflverseCsv(`${RELEASE_BASE}/schedules/games.csv`)
  const mapped = rows
    .filter(r => sinceSeason == null || Number(r.season) >= sinceSeason)
    .map(r => ({
      game_id: r.game_id,
      season: n(r.season),
      game_type: s(r.game_type),
      week: n(r.week),
      gameday: s(r.gameday),
      weekday: s(r.weekday),
      gametime: s(r.gametime),
      away_team: s(r.away_team),
      away_score: n(r.away_score),
      home_team: s(r.home_team),
      home_score: n(r.home_score),
      location: s(r.location),
      result: n(r.result),
      total: n(r.total),
      overtime: b(r.overtime),
      div_game: b(r.div_game),
      roof: s(r.roof),
      surface: s(r.surface),
      temp: n(r.temp),
      wind: n(r.wind),
      away_qb_id: s(r.away_qb_id),
      home_qb_id: s(r.home_qb_id),
      away_qb_name: s(r.away_qb_name),
      home_qb_name: s(r.home_qb_name),
      away_coach: s(r.away_coach),
      home_coach: s(r.home_coach),
      referee: s(r.referee),
      stadium_id: s(r.stadium_id),
      stadium: s(r.stadium),
      espn_game_id: s(r.espn),
      updated_at: new Date().toISOString(),
    }))
    .filter(r => r.game_id && r.season != null)
  return upsertChunked(admin, 'nfl_schedule', mapped, 'game_id')
}
