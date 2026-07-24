#!/usr/bin/env node
// One-time manual catch-up run for the L1/L3/L5/L10 Custom Matrix recency
// windows (src/lib/savantSplitsSync.ts, syncBothWindows) across all 4
// split-and-recency categories. The daily crons (api/cron/savant-sync-
// bat-tracking/batted-ball/swing-path/swing-timing) cover normal operation
// at ~10:00 UTC — this exists because those new windows were only added
// mid-day, so today's Matrix Factors would otherwise have no l1/l3/l5/l10
// data until tomorrow's run. Deliberately a standalone script (plain node,
// no `@/` alias), kept in lockstep with savantSplitsSync.ts — same pattern
// as backfill-statcast-pitch-log.mjs / sync-affinity.mjs.
//
// Usage (from hub/): node --env-file=.env.local scripts/manual-sync-matrix-windows.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with --env-file=.env.local from hub/')
  process.exit(1)
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

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

function dimsKey(dims) {
  return Object.keys(dims).sort().map(k => `${k}=${dims[k]}`).join('|')
}

const ALL_PITCH_TYPES = ['FF', 'SI', 'FC', 'CH', 'FS', 'FO', 'SC', 'CU', 'SL', 'ST', 'SV', 'KN']

const BAT_TRACKING = {
  category: 'bat_tracking',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type', 'bat_contact_code'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking?dateStart=${dateStart}&dateEnd=${dateEnd}` +
    `&gameType=Regular&groupBy=bat_contact_code%7Capi_pitch_type_group03%7Cpitch_hand%7Cbat_side` +
    `&isHardHit=&minSwings=1&minGroupSwings=1&seasonStart=${season}&seasonEnd=${season}` +
    `&type=${role}&sortColumn=avg_bat_speed&sortDirection=desc&csv=true`,
}
const BATTED_BALL_PROFILE = {
  category: 'batted_ball_splits',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/batted-ball?type=${role}&season%5B%5D=${season}` +
    `&splitYear=0&min=1&split%5B%5D=api_pitch_type_group03&split%5B%5D=bat_side&split%5B%5D=pitch_hand` +
    `&minSplit=1&gameType%5B%5D=R&dateStart=${dateStart}&dateEnd=${dateEnd}&batSide=&pitchHand=` +
    ALL_PITCH_TYPES.map(pt => `&pitchType%5B%5D=${pt}`).join('') +
    `&csv=true`,
}
const SWING_PATH_ATTACK_ANGLE = {
  category: 'swing_path_attack_angle',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type'],
  roles: ['batter'],
  url: ({ dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle?type=batter&gameType=Regular&team=&min=1` +
    `&seasonStart=${season}&seasonEnd=${season}&dateStart=${dateStart}&dateEnd=${dateEnd}` +
    `&batSide=&contactType=&isHardHit=&attackZone=&pitchHand=` +
    `&groupBy=api_pitch_type_group03%7Cpitch_hand%7Cbat_side&minGroupSwings=1&csv=true`,
}
const SWING_TIMING_MISS_DISTANCE = {
  category: 'swing_timing_miss_distance',
  dimColumns: ['bat_side', 'pitch_hand', 'api_pitch_type', 'bat_contact_code'],
  url: ({ role, dateStart, dateEnd, season }) =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-timing-miss-distance?type=${role}&season%5B%5D=${season}` +
    `&splitYear=0&min=1&split%5B%5D=api_pitch_type_group03&split%5B%5D=bat_contact_code&split%5B%5D=pitch_hand&split%5B%5D=bat_side` +
    `&minSplit=1&gameType%5B%5D=R&dateStart=${dateStart}&dateEnd=${dateEnd}&batSide=&contactType=&attackZone=&pitchHand=` +
    ALL_PITCH_TYPES.map(pt => `&pitchType%5B%5D=${pt}`).join('') +
    `&swingTimingX%5B%5D=Tiedup&swingTimingX%5B%5D=Centered&swingTimingX%5B%5D=Flail` +
    `&swingTimingY%5B%5D=Early&swingTimingY%5B%5D=OnTime&swingTimingY%5B%5D=Late` +
    `&swingTimingZ%5B%5D=Under&swingTimingZ%5B%5D=Linedup&swingTimingZ%5B%5D=Over` +
    `&sortColumn=bat_contact_code&sortDirection=asc&csv=true`,
}

const BOARDS = [BAT_TRACKING, BATTED_BALL_PROFILE, SWING_PATH_ATTACK_ANGLE, SWING_TIMING_MISS_DISTANCE]

async function syncSplitLeaderboard(board, season, role, windowType, dateStart, dateEnd) {
  const rows = await fetchSavantCsv(board.url({ role, dateStart, dateEnd, season }))
  const withId = rows.filter(r => r.id)
  if (!withId.length) return { rows: 0 }

  await admin.from('players').upsert(
    withId.map(r => ({ mlb_id: Number(r.id), full_name: r.name || `Player ${r.id}` })),
    { onConflict: 'mlb_id', ignoreDuplicates: true }
  )

  const upsertRows = withId.map(r => {
    const dims = {}
    for (const col of board.dimColumns) dims[col] = r[col] ?? ''
    const metrics = {}
    for (const [k, v] of Object.entries(r)) {
      if (k === 'id' || k === 'name' || board.dimColumns.includes(k) || v === '') continue
      if (v === 'NaN') { metrics[k] = null; continue }
      const n = Number(v)
      metrics[k] = Number.isFinite(n) ? n : v
    }
    return {
      mlb_id: Number(r.id), role, category: board.category, window_type: windowType,
      date_start: dateStart, date_end: dateEnd,
      dims, dims_key: dimsKey(dims), metrics, last_synced_at: new Date().toISOString(),
    }
  })

  const { error } = await admin.from('player_statcast_splits')
    .upsert(upsertRows, { onConflict: 'mlb_id,role,category,window_type,dims_key' })
  if (error) throw error

  return { rows: upsertRows.length }
}

const REGULAR_SEASON_START = { 2026: '2026-03-25' }
const RECENCY_DAYS = 6
const MATRIX_RECENCY_WINDOWS = { l1: 2, l3: 5, l5: 8, l10: 16 }

function seasonStartDate(season) { return REGULAR_SEASON_START[season] ?? `${season}-03-25` }
function todayET() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) }
function daysAgoET(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

async function syncBothWindows(board, season) {
  const seasonStart = seasonStartDate(season)
  const today = todayET()
  const recencyStart = daysAgoET(RECENCY_DAYS)

  const matrixWindows = Object.keys(MATRIX_RECENCY_WINDOWS).map(w => [w, daysAgoET(MATRIX_RECENCY_WINDOWS[w]), today])
  const windows = [['season', seasonStart, today], ['recency', recencyStart, today], ...matrixWindows]

  const results = {}
  for (const role of board.roles ?? ['batter', 'pitcher']) {
    for (const [windowType, dateStart, dateEnd] of windows) {
      const key = `${role}_${windowType}`
      try {
        results[key] = await syncSplitLeaderboard(board, season, role, windowType, dateStart, dateEnd)
      } catch (e) {
        console.error(`[manual-sync:${board.category}] failed`, key, e)
        results[key] = { error: e?.message || String(e) }
      }
    }
  }
  return results
}

const season = 2026
for (const board of BOARDS) {
  console.log(`\n=== ${board.category} ===`)
  const results = await syncBothWindows(board, season)
  console.log(JSON.stringify(results, null, 2))
}
console.log('\nDone.')
