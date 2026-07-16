import { createAdminClient } from '@/lib/supabase/admin'

// Baseball Savant has no official API — every category below is a real,
// confirmed-working undocumented CSV export endpoint (verified live before
// writing this, not guessed). Unlike the MLB Stats API bio/season/career
// crons (one HTTP call per player), each Savant leaderboard endpoint
// returns EVERY qualified player for that category/season in a single
// response, so there's no per-player claiming here — sync_state tracks
// progress per CATEGORY instead.
//
// "percentile_rankings" (named in the plan's Tier A list) is deliberately
// NOT included yet: Savant's percentile rankings aren't a bulk leaderboard
// export — they're rendered per individual player page — so pulling them
// needs a different scraping approach than the CSV categories here. Left
// as a known, explicit gap rather than guessed at.
export type SavantCategory = {
  name: string
  target: 'hitting' | 'fielding' | 'baserunning'
  url: (year: number) => string
}

export const SAVANT_TIER_A: SavantCategory[] = [
  {
    name: 'exit_velocity_barrels',
    target: 'hitting',
    url: year => `https://baseballsavant.mlb.com/leaderboard/custom?year=${year}&type=batter&filter=&min=q&selections=exit_velocity_avg,launch_angle_avg,barrel_batted_rate,hard_hit_percent,avg_best_speed&chart=false&x=xwoba&y=xwoba&r=no&chartType=beeswarm&csv=true`,
  },
  {
    name: 'expected_stats',
    target: 'hitting',
    url: year => `https://baseballsavant.mlb.com/leaderboard/custom?year=${year}&type=batter&filter=&min=q&selections=xwoba,xba,xslg,xobp,xiso&chart=false&x=xwoba&y=xwoba&r=no&chartType=beeswarm&csv=true`,
  },
  {
    name: 'batted_ball_profile',
    target: 'hitting',
    url: year => `https://baseballsavant.mlb.com/leaderboard/custom?year=${year}&type=batter&filter=&min=q&selections=groundballs_percent,flyballs_percent,linedrives_percent,popups_percent,pull_percent,straightaway_percent,opposite_percent&chart=false&x=xwoba&y=xwoba&r=no&chartType=beeswarm&csv=true`,
  },
  {
    name: 'outs_above_average',
    target: 'fielding',
    url: year => `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Fielder&startYear=${year}&endYear=${year}&team=&range=year&min=1&pos=&roles=&viz=hide&csv=true`,
  },
  {
    name: 'sprint_speed',
    target: 'baserunning',
    url: year => `https://baseballsavant.mlb.com/leaderboard/sprint_speed?year=${year}&position=&team=&min=10&csv=true`,
  },
]

// Minimal but correct CSV parser — handles quoted fields containing commas
// (Savant's own "last_name, first_name" column has a literal comma inside
// quotes) and quoted fields containing escaped `""`. Not a general-purpose
// CSV library, but sufficient for Savant's consistently-quoted export format.
export function parseCsv(text: string): Record<string, string>[] {
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

export async function fetchSavantCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' } })
  if (!res.ok) throw new Error(`Savant CSV ${res.status}: ${url}`)
  return parseCsv(await res.text())
}

type AdminClient = ReturnType<typeof createAdminClient>

// Every numeric-looking value is kept in `metrics` as a real number (not the
// raw string) so the eventual player page can sort/filter without
// re-parsing; non-numeric columns (name, team) pass through as strings.
export function toMetrics(row: Record<string, string>): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === '' || v === undefined) continue
    const n = Number(v)
    out[k] = Number.isFinite(n) && v.trim() !== '' && !/[a-zA-Z]/.test(v) ? n : v
  }
  return out
}

export async function upsertSavantCategory(admin: AdminClient, category: SavantCategory, season: number) {
  const rows = await fetchSavantCsv(category.url(season))
  const withId = rows.filter(r => r.player_id)
  if (!withId.length) return { rows: 0 }

  // Ensure every player_id in this CSV has at least a stub `players` row —
  // Savant's leaderboards aren't gated by whether mlb-sync-bio has reached
  // that player yet, and every statcast table FKs to players(mlb_id), so an
  // unrecognized id would fail the WHOLE batch upsert, not just that row.
  await admin.from('players').upsert(
    withId.map(r => ({ mlb_id: Number(r.player_id), full_name: r['last_name, first_name'] || `Player ${r.player_id}` })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )

  if (category.target === 'hitting') {
    const { error } = await admin.from('player_statcast_hitting_season').upsert(
      withId.map(r => ({
        mlb_id: Number(r.player_id), season, category: category.name,
        metrics: toMetrics(r), last_synced_at: new Date().toISOString(),
      })),
      { onConflict: 'mlb_id,season,category' }
    )
    if (error) throw error
  } else if (category.target === 'fielding') {
    const { error } = await admin.from('player_fielding_season').upsert(
      withId.map(r => ({
        mlb_id: Number(r.player_id), season, position: r.primary_pos_formatted || 'UNK', category: category.name,
        metrics: toMetrics(r), last_synced_at: new Date().toISOString(),
      })),
      { onConflict: 'mlb_id,season,position,category' }
    )
    if (error) throw error
  } else {
    const { error } = await admin.from('player_baserunning_season').upsert(
      withId.map(r => ({
        mlb_id: Number(r.player_id), season, category: category.name,
        metrics: toMetrics(r), last_synced_at: new Date().toISOString(),
      })),
      { onConflict: 'mlb_id,season,category' }
    )
    if (error) throw error
  }

  return { rows: withId.length }
}
