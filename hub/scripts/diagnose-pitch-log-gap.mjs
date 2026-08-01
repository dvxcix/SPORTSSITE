// One-off diagnostic + backfill: replicates syncStatcastDay from
// src/lib/statcastPitchLogSync.ts for dates the daily cron hasn't produced
// player_pitch_log rows for, using the SAME parseCsv logic as production
// (savantSync.ts) — an earlier naive split(',') version of this script gave
// a false "0 usable rows" reading because it didn't strip CSV quoting.
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing Supabase env vars'); process.exit(1) }
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const SEASON = 2026
const DATES = process.argv.slice(2).length ? process.argv.slice(2) : ['2026-07-30', '2026-07-31']
const PITCH_LOG_TABLE = 'player_pitch_log'
const WRITE_CHUNK_SIZE = 500

function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length > 0)
  if (!lines.length) return []
  const parseLine = (line) => {
    const fields = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else { inQuotes = false } }
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
    header.forEach((h, i) => { row[h] = values[i] })
    return row
  })
}

async function fetchScheduleJson(date) {
  const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=venue`, {
    cache: 'no-store', headers: { 'User-Agent': 'SlipSurge/1.0' },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`MLB schedule ${res.status}: ${date} :: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

function pitchLogCsvUrl(date) {
  return `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=` +
    `&stadium=&hfBBL=&hfNewZones=&hfGT=R%7C&hfC=&hfSea=&hfSit=&player_type=pitcher&hfOuts=` +
    `&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${date}&game_date_lt=${date}` +
    `&hfInfield=&team=&position=&hfOutfield=&hfRO=&home_road=&hfFlag=&hfPull=&metric_1=&hfInn=` +
    `&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=api_p_release_speed` +
    `&sort_order=desc&min_pas=0&type=details`
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
  console.log(`  [savant] status=${res.status} bytes=${text.length}`)
  if (!res.ok) throw new Error(`Savant CSV ${res.status}: ${url} :: ${text.slice(0, 300)}`)
  return parseCsv(text)
}

function numOrNull(v) { if (v === undefined || v === '' || v === 'NaN') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
function intOrNull(v) { const n = numOrNull(v); return n === null ? null : Math.round(n) }
const SWING_DESCRIPTIONS = new Set(['foul', 'foul_tip', 'foul_bunt', 'missed_bunt', 'bunt_foul_tip', 'foul_pitchout', 'hit_into_play', 'swinging_strike', 'swinging_strike_blocked'])
const WHIFF_DESCRIPTIONS = new Set(['swinging_strike', 'swinging_strike_blocked', 'missed_bunt'])

for (const date of DATES) {
  console.log(`\n=== ${date} ===`)
  try {
    const d = await fetchScheduleJson(date)
    const games = (d?.dates?.[0]?.games ?? []).filter(g => g.gameType === 'R')
    console.log(`  [mlb schedule] ${games.length} regular-season games`)
    if (!games.length) { console.log('  no games — skipping'); continue }

    const gameRows = games.map(g => ({
      game_pk: String(g.gamePk), season: SEASON, game_date: g.officialDate, game_type: g.gameType,
      home_team_id: g.teams?.home?.team?.id ?? null, home_team: g.teams?.home?.team?.name ?? null,
      away_team_id: g.teams?.away?.team?.id ?? null, away_team: g.teams?.away?.team?.name ?? null,
      venue_id: g.venue?.id ?? null, venue_name: g.venue?.name ?? null, day_night: g.dayNight ?? null,
      last_synced_at: new Date().toISOString(),
    }))
    const { error: gamesErr } = await admin.from('games').upsert(gameRows, { onConflict: 'game_pk' })
    if (gamesErr) { console.error('  [games upsert] FAILED', gamesErr); continue }
    console.log(`  [games upsert] wrote ${gameRows.length} rows`)

    const csvRows = await fetchSavantCsv(pitchLogCsvUrl(date))
    const withKeys = csvRows.filter(r => r.game_pk && r.pitcher && r.batter && r.at_bat_number && r.pitch_number)
    console.log(`  [savant] ${csvRows.length} raw rows, ${withKeys.length} with complete keys`)
    if (!withKeys.length) { console.log('  no usable pitch rows'); continue }

    const stubs = new Map()
    for (const r of withKeys) {
      const pid = Number(r.pitcher)
      if (pid && !stubs.has(pid)) stubs.set(pid, r.player_name || `Player ${pid}`)
      const bid = Number(r.batter)
      if (bid && !stubs.has(bid)) stubs.set(bid, `Player ${bid}`)
    }
    const { error: playersErr } = await admin.from('players').upsert(
      Array.from(stubs, ([mlb_id, full_name]) => ({ mlb_id, full_name })),
      { onConflict: 'mlb_id', ignoreDuplicates: true }
    )
    if (playersErr) console.error('  [players stub upsert] error (non-fatal)', playersErr)

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
      attack_angle: numOrNull(r.attack_angle), swing_length: numOrNull(r.swing_length),
      swing_path_tilt: numOrNull(r.swing_path_tilt), attack_direction: numOrNull(r.attack_direction),
      launch_speed_angle: intOrNull(r.launch_speed_angle),
      raw: r,
    }))

    let written = 0
    for (let i = 0; i < upsertRows.length; i += WRITE_CHUNK_SIZE) {
      const chunk = upsertRows.slice(i, i + WRITE_CHUNK_SIZE)
      const { error } = await admin.from(PITCH_LOG_TABLE).upsert(chunk, { onConflict: 'season,game_pk,at_bat_index,pitch_number' })
      if (error) { console.error(`  [pitch_log upsert] FAILED at chunk ${i}`, error); break }
      written += chunk.length
    }
    console.log(`  [pitch_log upsert] wrote ${written}/${upsertRows.length} rows`)
  } catch (e) {
    console.error(`  FAILED:`, e.message)
  }
}
