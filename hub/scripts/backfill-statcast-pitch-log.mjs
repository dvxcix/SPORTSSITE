#!/usr/bin/env node
// One-time (or catch-up) full-season backfill for player_pitch_log_2026 +
// games. Run locally, NOT as a Vercel function — a full season is 100+
// days of per-day Savant CSV fetches, way past any serverless maxDuration,
// so this is a plain long-running Node script instead.
//
// Deliberately a standalone script, not a re-export of
// src/lib/statcastPitchLogSync.ts: that module imports via the `@/` path
// alias, which only resolves inside the Next.js build — plain `node` can't
// follow it. The fetch/parse/mapping logic below is intentionally kept in
// lockstep with that module; if one changes, check the other.
//
// Usage (from hub/):  node --env-file=.env.local scripts/backfill-statcast-pitch-log.mjs [startDate] [endDate]
// Date args are optional overrides (yyyy-mm-dd), default full season-to-date.

import { createClient } from '@supabase/supabase-js'
import util from 'node:util'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local from hub/')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const SEASON = 2026
const SEASON_START = '2026-03-25' // matches REGULAR_SEASON_START in savantSplitsSync.ts
// `player_pitch_log` is a partitioned parent (RANGE by `season`), with
// `player_pitch_log_2026` as its partition — PostgREST only exposes the
// parent name; writing to the partition name directly 404s (PGRST205).
const PITCH_LOG_TABLE = 'player_pitch_log'
const CONCURRENCY = 3
const WRITE_CHUNK_SIZE = 500

function todayET() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
function addDaysUTC(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function allDatesInclusive(start, end) {
  const out = []
  for (let d = start; d <= end; d = addDaysUTC(d, 1)) out.push(d)
  return out
}

// ─── Savant CSV fetch + parse — mirrors src/lib/savantSync.ts ─────────────
function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length > 0)
  if (!lines.length) return []
  const parseLine = line => {
    const fields = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false }
        else cur += ch
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
    const row = {}
    header.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}

async function fetchSavantCsv(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Savant CSV ${res.status}: ${url} :: ${text.slice(0, 300)}`)
  return parseCsv(text)
}

function pitchLogCsvUrl(date) {
  return `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=` +
    `&stadium=&hfBBL=&hfNewZones=&hfGT=R%7C&hfC=&hfSea=&hfSit=&player_type=pitcher&hfOuts=` +
    `&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${date}&game_date_lt=${date}` +
    `&hfInfield=&team=&position=&hfOutfield=&hfRO=&home_road=&hfFlag=&hfPull=&metric_1=&hfInn=` +
    `&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=api_p_release_speed` +
    `&sort_order=desc&min_pas=0&type=details`
}

async function fetchScheduleJson(date) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=venue`, {
    headers: { 'User-Agent': 'SlipSurge/1.0' },
  })
  if (!res.ok) throw new Error(`MLB schedule ${res.status}: ${date}`)
  return res.json()
}

function numOrNull(v) {
  if (v === undefined || v === '' || v === 'NaN') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function intOrNull(v) {
  const n = numOrNull(v)
  return n === null ? null : Math.round(n)
}

const SWING_DESCRIPTIONS = new Set([
  'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'bunt_foul_tip', 'foul_pitchout',
  'hit_into_play', 'swinging_strike', 'swinging_strike_blocked',
])
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])

async function syncGamesForDate(date) {
  const d = await fetchScheduleJson(date)
  const games = (d?.dates?.[0]?.games ?? []).filter(g => g.gameType === 'R')
  if (!games.length) return { games: 0 }

  const rows = games.map(g => ({
    game_pk: String(g.gamePk), season: SEASON, game_date: g.officialDate, game_type: g.gameType,
    home_team_id: g.teams?.home?.team?.id ?? null, home_team: g.teams?.home?.team?.name ?? null,
    away_team_id: g.teams?.away?.team?.id ?? null, away_team: g.teams?.away?.team?.name ?? null,
    venue_id: g.venue?.id ?? null, venue_name: g.venue?.name ?? null, day_night: g.dayNight ?? null,
    last_synced_at: new Date().toISOString(),
  }))

  const { error } = await admin.from('games').upsert(rows, { onConflict: 'game_pk' })
  if (error) throw error
  return { games: rows.length }
}

async function syncPitchLogForDate(date) {
  const rows = await fetchSavantCsv(pitchLogCsvUrl(date))
  const withKeys = rows.filter(r => r.game_pk && r.pitcher && r.batter && r.at_bat_number && r.pitch_number)
  if (!withKeys.length) return { rows: 0 }

  const stubs = new Map()
  for (const r of withKeys) {
    const pid = Number(r.pitcher)
    if (pid && !stubs.has(pid)) stubs.set(pid, r.player_name || `Player ${pid}`)
    const bid = Number(r.batter)
    if (bid && !stubs.has(bid)) stubs.set(bid, `Player ${bid}`)
  }
  await admin.from('players').upsert(
    Array.from(stubs, ([mlb_id, full_name]) => ({ mlb_id, full_name })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )

  const upsertRows = withKeys.map(r => ({
    season: SEASON, game_pk: String(r.game_pk), at_bat_index: Number(r.at_bat_number), pitch_number: Number(r.pitch_number),
    game_date: r.game_date, pitcher_id: Number(r.pitcher), batter_id: Number(r.batter),
    pitch_type: r.pitch_type || null,
    velocity: numOrNull(r.release_speed), spin_rate: intOrNull(r.release_spin_rate),
    pfx_x: numOrNull(r.pfx_x), pfx_z: numOrNull(r.pfx_z),
    balls: intOrNull(r.balls), strikes: intOrNull(r.strikes),
    inning: intOrNull(r.inning), top_bottom: r.inning_topbot || null, zone: intOrNull(r.zone),
    events: r.events || null, description: r.description || null,
    is_in_play: r.type === 'X',
    is_swing: SWING_DESCRIPTIONS.has(r.description),
    is_whiff: WHIFF_DESCRIPTIONS.has(r.description),
    is_home_run: r.events === 'home_run',
    launch_speed: numOrNull(r.launch_speed), launch_angle: numOrNull(r.launch_angle),
    xwoba: numOrNull(r.estimated_woba_using_speedangle),
    bat_speed: numOrNull(r.bat_speed),
    run_value: numOrNull(r.delta_run_exp),
    raw: r,
  }))

  for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from(PITCH_LOG_TABLE)
      .upsert(upsertRows.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'season,game_pk,at_bat_index,pitch_number' })
    if (error) throw error
  }

  return { rows: upsertRows.length }
}

async function alreadyDone(date) {
  const { count, error } = await admin.from(PITCH_LOG_TABLE)
    .select('*', { count: 'exact', head: true })
    .eq('game_date', date)
  if (error) throw error
  return (count ?? 0) > 0
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  const start = process.argv[2] || SEASON_START
  const end = process.argv[3] || addDaysUTC(todayET(), -1) // yesterday ET — today's games may still be in progress
  const dates = allDatesInclusive(start, end)
  console.log(`Backfilling ${PITCH_LOG_TABLE}: ${SEASON_START} .. ${end} (${dates.length} calendar dates, concurrency ${CONCURRENCY})`)

  let done = 0
  const failures = []
  const startedAt = Date.now()

  await mapWithConcurrency(dates, CONCURRENCY, async date => {
    try {
      if (await alreadyDone(date)) {
        done++
        console.log(`[skip] ${date} already has pitch rows (${done}/${dates.length})`)
        return
      }
      const g = await syncGamesForDate(date)
      const p = g.games ? await syncPitchLogForDate(date) : { rows: 0 }
      done++
      console.log(`[ok]   ${date} games=${g.games} pitches=${p.rows} (${done}/${dates.length})`)
    } catch (e) {
      done++
      const msg = e?.message || JSON.stringify(e) || String(e)
      failures.push({ date, error: msg })
      console.error(`[fail] ${date}: ${msg} (${done}/${dates.length})`)
      console.error(util.inspect(e, { depth: 6 }))
    }
  })

  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1)
  console.log(`\nDone in ${elapsedMin}m. ${dates.length - failures.length}/${dates.length} dates ok.`)
  if (failures.length) {
    console.log(`${failures.length} failed date(s) — re-run this script to retry (already-synced dates are skipped):`)
    for (const f of failures) console.log(`  ${f.date}: ${f.error}`)
    process.exitCode = 1
  }
}

main()
