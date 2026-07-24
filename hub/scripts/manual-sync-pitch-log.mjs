#!/usr/bin/env node
// One-time manual catch-up for the daily Statcast pitch-log sync
// (src/lib/statcastPitchLogSync.ts / api/cron/savant-sync-pitch-log) — the
// `games` table only had 2 of 07-22's real 17 games and 1 of 07-23's real 5
// (confirmed live against MLB's own schedule API), so `player_pitch_log`
// was missing most of both days. Deliberately a standalone script (plain
// node, no `@/` alias), kept in lockstep with statcastPitchLogSync.ts.
//
// Usage (from hub/): node --env-file=.env.local scripts/manual-sync-pitch-log.mjs 2026-07-22 2026-07-23

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local from hub/')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const SEASON = 2026

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
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/csv,text/plain,*/*',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Savant CSV ${res.status}: ${url} :: ${text.slice(0, 300)}`)
  const rows = parseCsv(text)
  if (!rows.length) console.error('[savant] empty/unparseable response', { url, status: res.status })
  return rows
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
    cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
  })
  if (!res.ok) throw new Error(`MLB schedule ${res.status}: ${date}`)
  return res.json()
}

function numOrNull(v) { if (v === undefined || v === '' || v === 'NaN') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function intOrNull(v) { const n = numOrNull(v); return n === null ? null : Math.round(n) }

const SWING_DESCRIPTIONS = new Set([
  'foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'bunt_foul_tip', 'foul_pitchout',
  'hit_into_play', 'swinging_strike', 'swinging_strike_blocked',
])
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])
const WRITE_CHUNK_SIZE = 500

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
    plate_x: numOrNull(r.plate_x), plate_z: numOrNull(r.plate_z),
    stand: r.stand || null, p_throws: r.p_throws || null,
    run_value: numOrNull(r.delta_run_exp),
    raw: r,
  }))

  for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
    const { error } = await admin.from('player_pitch_log')
      .upsert(upsertRows.slice(i, i + WRITE_CHUNK_SIZE), { onConflict: 'season,game_pk,at_bat_index,pitch_number' })
    if (error) throw error
  }
  return { rows: upsertRows.length }
}

const dates = process.argv.slice(2)
if (!dates.length) { console.error('Usage: node scripts/manual-sync-pitch-log.mjs YYYY-MM-DD [YYYY-MM-DD ...]'); process.exit(1) }

for (const date of dates) {
  console.log(`\n=== ${date} ===`)
  try {
    const g = await syncGamesForDate(date)
    console.log('games:', g)
    if (g.games) {
      const p = await syncPitchLogForDate(date)
      console.log('pitches:', p)
    }
  } catch (e) {
    console.error('FAILED', date, e)
  }
}
console.log('\nDone.')
