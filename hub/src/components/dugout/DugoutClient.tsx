'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { BookLogo } from '@/components/BookLogo'
import { Tooltip } from '@/components/ui/tooltip-card'
import { useWatchlist } from '@/context/WatchlistContext'
import { PROP_META } from '@/lib/watchlist'
import { PlayerAvatar as SharedPlayerAvatar } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@/lib/mlb-api'
import {
  PitchMixTable, BatterVsPitchTable, StatTile, SortableTH,
  toggleSortState as toggleMatchupSort, cmpNullsLast as cmpMatchupNullsLast,
  pct as matchupPct,
} from '@/components/pitcher-report/MatchupTables'
import type { SortState as MatchupSortState } from '@/components/pitcher-report/MatchupTables'

// ─── helpers ──────────────────────────────────────────────────────────────────
const normName = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

const nv = (v: any): number | null => { const x = parseFloat(v); return isNaN(x) ? null : x }
const f1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : '—'
const f2 = (v: number | null | undefined) => v != null ? v.toFixed(2) : '—'
const oStr = (v: number | null | undefined) => v != null ? (v > 0 ? `+${v}` : String(v)) : '—'
const dlt = (v: number | null | undefined, scale = 1) =>
  v != null ? (v >= 0 ? '+' : '') + (v * scale).toFixed(scale === 100 ? 1 : 2) : '—'
const pp = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}` : '—'
// barrel_batted_rate and hard_hit_pct come out of mlb-party already scaled
// as percentages (5.8 meaning 5.8%), unlike the other rate fields which are
// fractions (0-1) — using pp() on these double-scales into absurd numbers
// like 1210.0%. Display as-is instead.
const ppRaw = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}` : '—'

function toImpl(o: number | null): number | null {
  if (o == null) return null
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100)
}
function decOdds(p: number | null): number | null {
  if (p == null) return null
  return p > 0 ? p / 100 + 1 : 100 / (-p) + 1
}
function fdczDiv(fd: number | null, cz: number | null): number | null {
  const a = decOdds(fd), b = decOdds(cz)
  if (a == null || b == null) return null
  return 1 / a - 1 / b
}
function implRatio(a: number | null, b: number | null): number | null {
  const ia = toImpl(a), ib = toImpl(b)
  if (ia == null || ib == null || ib === 0) return null
  return ia / ib
}

// ─── lookup map builders ──────────────────────────────────────────────────────
function buildSplitMap(rows: any[]) {
  const byId: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  const byName: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const win = r.win || 'season'
    if (id) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      ;(byId[id][hand] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      ;(byName[nn][hand] as any)[win] = r
    }
  }
  return { byId, byName }
}

function buildTimingMap(rows: any[]) {
  const byId: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  const byName: Record<string, Record<string, Record<string, { season?: any; recent?: any }>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const hand = r.pitch_hand || 'R'
    const pt = r.pitch_type || ''
    const win = r.win || 'season'
    if (id && pt) {
      if (!byId[id]) byId[id] = {}
      if (!byId[id][hand]) byId[id][hand] = {}
      if (!byId[id][hand][pt]) byId[id][hand][pt] = {}
      ;(byId[id][hand][pt] as any)[win] = r
    }
    const nn = r.name_norm || ''
    if (nn && pt) {
      if (!byName[nn]) byName[nn] = {}
      if (!byName[nn][hand]) byName[nn][hand] = {}
      if (!byName[nn][hand][pt]) byName[nn][hand][pt] = {}
      ;(byName[nn][hand][pt] as any)[win] = r
    }
  }
  return { byId, byName }
}

// Ingestion (mlb-party's ingest-pitcher-statcast edge function) writes one
// row per (mlb_id, bat_hand, win) — batted-ball-against, bat-tracking-against,
// and arm-angle are genuinely computed separately for facing lefties vs
// righties. This USED to collapse straight to `map[id][win]`, discarding
// bat_hand entirely and silently keeping whichever hand's row happened to
// upsert last — same "map collapse drops a real dimension" bug as the
// FanDuel game_key issue. Now keyed by hand first, matched against the
// specific batter standing in the box (see the `handRow` lookup at each
// call site), falling back to 'R' then whatever's there if that batter's
// hand is missing for this pitcher.
function buildPitcherMap(rows: any[]) {
  const map: Record<string, Record<string, { season?: any; recent?: any }>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id) continue
    const hand = r.bat_hand || 'R'
    const win = r.win || 'season'
    if (!map[id]) map[id] = {}
    if (!map[id][hand]) map[id][hand] = {}
    ;(map[id][hand] as any)[win] = r
  }
  return map
}

function pickPitcherRow(pitcherMap: PitcherMap, pitcherId: string | number | null | undefined, batterHand: string | null | undefined) {
  if (!pitcherId) return null
  const byHand = pitcherMap[String(pitcherId)]
  if (!byHand) return null
  const hand = (batterHand || 'R') as string
  const row = byHand[hand] ?? byHand['R'] ?? Object.values(byHand)[0]
  return row ? (row.season ?? row.recent) : null
}

// ─── real matchup edge: batter-vs-this-pitch-type recently, pitcher's own
// recent results allowing that same pitch type — the actual "books" view,
// not season-long averages that flatten a slump or a hot streak. Computed
// from raw Statcast pitch events server-side (mlb-party's
// ingest-pitch-type-recency edge function), not Savant's season-only
// pitch-arsenal-stats leaderboard.
function buildBatterPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const nn = r.name_norm || ''
    const pt = r.pitch_type || ''
    const hand = r.pitcher_hand || 'R'
    if (!nn || !pt) continue
    if (!map[nn]) map[nn] = {}
    if (!map[nn][pt]) map[nn][pt] = {}
    map[nn][pt][hand] = r
  }
  return map
}

// One row per game already sorted desc by game_date (see the API query) —
// grouping by mlb_id gives a true "last N games PLAYED" window, unlike the
// calendar-day window above, which over/under-counts games for anyone with
// an off day, injury, or recent call-up.
function buildGameLogMap(rows: any[]) {
  const map: Record<string, any[]> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id) continue
    ;(map[id] ??= []).push(r)
  }
  return map
}

// The individual pitches behind a batter_pitch_type_recent row — a real
// batted-ball/pitch log, not just the aggregate. Already sorted seq asc
// (most recent first) via the API query.
function buildPitchEventsMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any[]>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const pt = r.pitch_type || ''
    const hand = r.pitcher_hand || 'R'
    if (!id || !pt) continue
    if (!map[id]) map[id] = {}
    if (!map[id][pt]) map[id][pt] = {}
    ;(map[id][pt][hand] ??= []).push(r)
  }
  return map
}

function buildPlatoonMap(rows: any[]) {
  const map: Record<string, { vl?: any; vr?: any }> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id || (r.split_code !== 'vl' && r.split_code !== 'vr')) continue
    ;(map[id] ??= {})[r.split_code as 'vl' | 'vr'] = r
  }
  return map
}

// Sums the last N game logs (already sorted newest-first) into a rolling
// line. AVG/SLG are exact (computed from real totals); OBP/OPS are close
// approximations since MLB's gameLog rows don't carry HBP/SF per game.
function rollupGames(logs: any[], n: number) {
  const slice = logs.slice(0, n)
  if (!slice.length) return null
  let pa = 0, ab = 0, h = 0, d2 = 0, d3 = 0, hr = 0, bb = 0, so = 0, rbi = 0
  for (const g of slice) {
    pa += g.pa || 0; ab += g.ab || 0; h += g.h || 0; d2 += g.doubles || 0; d3 += g.triples || 0
    hr += g.hr || 0; bb += g.bb || 0; so += g.so || 0; rbi += g.rbi || 0
  }
  const tb = (h - d2 - d3 - hr) + d2 * 2 + d3 * 3 + hr * 4
  const avg = ab > 0 ? h / ab : null
  const slg = ab > 0 ? tb / ab : null
  const obp = (ab + bb) > 0 ? (h + bb) / (ab + bb) : null
  return { games: slice.length, pa, ab, h, hr, rbi, bb, so, avg, slg, obp, ops: obp != null && slg != null ? obp + slg : null }
}

function buildPitcherPitchMap(rows: any[]) {
  const map: Record<string, Record<string, Record<string, any>>> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    const pt = r.pitch_type || ''
    const hand = r.bat_hand || 'R'
    if (!id || !pt) continue
    if (!map[id]) map[id] = {}
    if (!map[id][pt]) map[id][pt] = {}
    map[id][pt][hand] = r
  }
  return map
}

// ─── pitch-mix weighted timing ────────────────────────────────────────────────
type TimingMap = ReturnType<typeof buildTimingMap>

function computeTiming(
  batterId: string, batterName: string, pitcherHand: string,
  pitcherRow: any, timingMap: TimingMap
) {
  if (!pitcherRow) return { s_timing: null, r_timing: null, s_miss: null, r_miss: null }
  const mix = ([
    ['FF', pitcherRow.pct_fastball || 0],
    ['SI', pitcherRow.pct_sinker || 0],
    ['FC', pitcherRow.pct_cutter || 0],
    ['SL', pitcherRow.pct_slider || 0],
    ['ST', pitcherRow.pct_slider || 0],
    ['CU', pitcherRow.pct_curveball || 0],
    ['CH', pitcherRow.pct_changeup || 0],
    ['FS', pitcherRow.pct_splitter || 0],
  ] as [string, number][]).filter(([, p]) => p > 0.08)
  if (!mix.length) return { s_timing: null, r_timing: null, s_miss: null, r_miss: null }

  let st = 0, rt = 0, sm = 0, rm = 0
  let sw = 0, rw = 0, smw = 0, rmw = 0
  for (const [pt, w] of mix) {
    const tRows =
      timingMap.byId[batterId]?.[pitcherHand]?.[pt] ||
      timingMap.byName[batterName]?.[pitcherHand]?.[pt]
    if (!tRows) continue
    const { season: tse, recent: tre } = tRows as { season?: any; recent?: any }
    if (tse?.on_time_percent != null) { st += w * tse.on_time_percent; sw += w }
    if (tre?.on_time_percent != null) { rt += w * tre.on_time_percent; rw += w }
    if (tse?.miss_distance != null) { sm += w * tse.miss_distance; smw += w }
    if (tre?.miss_distance != null) { rm += w * tre.miss_distance; rmw += w }
  }
  return {
    s_timing: sw > 0 ? st / sw : null,
    r_timing: rw > 0 ? rt / rw : null,
    s_miss:   smw > 0 ? sm / smw : null,
    r_miss:   rmw > 0 ? rm / rmw : null,
  }
}

// ─── build batter row ─────────────────────────────────────────────────────────
type SplitMap   = ReturnType<typeof buildSplitMap>
type PitcherMap = ReturnType<typeof buildPitcherMap>
type BatterPitchMap  = ReturnType<typeof buildBatterPitchMap>
type PitcherPitchMap = ReturnType<typeof buildPitcherPitchMap>
type GameLogMap = ReturnType<typeof buildGameLogMap>
type PlatoonMap = ReturnType<typeof buildPlatoonMap>
type PitchEventsMap = ReturnType<typeof buildPitchEventsMap>

// The actual "will this guy go deep TONIGHT" signal — usage-weighted across
// every pitch this specific pitcher throws: is the batter recently hitting
// that exact pitch hard (high hard-hit%, low whiff%), AND has the pitcher
// recently been getting hit hard on that same pitch too. Requires real
// recent sample on both sides (≥8 pitches) per pitch type, else that pitch
// type is skipped rather than guessed at. This is what was missing from the
// paper score — it only ever looked at the batter's own generic season/
// recent form, never at tonight's specific pitcher or matchup at all.
function computeMatchupEdge(
  nn: string, pitcherHand: string, batterHand: string, pitRow: any,
  batterPitchMap: BatterPitchMap, pitcherPitchMap: PitcherPitchMap
): number | null {
  if (!pitRow) return null
  const pitcherIdKey = String(pitRow.mlb_id || '')
  const mix = ([
    ['FF', pitRow.pct_fastball  || 0], ['SI', pitRow.pct_sinker   || 0], ['FC', pitRow.pct_cutter || 0],
    ['SL', pitRow.pct_slider    || 0], ['CU', pitRow.pct_curveball || 0], ['CH', pitRow.pct_changeup || 0],
    ['FS', pitRow.pct_splitter  || 0],
  ] as [string, number][]).filter(([, p]) => p > 4)
  if (!mix.length) return null
  let sum = 0, wsum = 0
  for (const [pt, usage] of mix) {
    const batEdge = batterPitchMap[nn]?.[pt]?.[pitcherHand]
    const pitEdge = pitcherPitchMap[pitcherIdKey]?.[pt]?.[batterHand || 'R']
    if (!batEdge || !pitEdge || batEdge.pitches < 8 || pitEdge.pitches < 8) continue
    const batScore = (batEdge.hard_hit_pct ?? 30) - (batEdge.whiff_pct ?? 25)
    const pitScore = (pitEdge.hard_hit_pct ?? 30) - (pitEdge.whiff_pct ?? 20)
    // A bucket sitting right at the 8-pitch floor is noise, not signal — a
    // batter can look great or terrible off 8 pitches purely by luck. Scale
    // each pitch type's say in the average by how much data actually backs
    // it (20 pitches ≈ full confidence), so a well-sampled bucket properly
    // outweighs a barely-qualifying one instead of both counting equally
    // via usage% alone. This is what let noisy small-sample edges (e.g. a
    // bench bat's one hot bucket) outrank a genuinely strong hitter's more
    // tempered matchup read.
    const sampleConf = Math.min(1, Math.min(batEdge.pitches, pitEdge.pitches) / 20)
    const w = usage * sampleConf
    sum += w * (batScore + pitScore)
    wsum += w
  }
  return wsum > 0 ? sum / wsum : null
}

function buildBatterRow(
  player: any,
  pitcherHand: string,
  pitcherId: number | null,
  splitMap: SplitMap,
  timingMap: TimingMap,
  pitcherMap: PitcherMap,
  fhrAvgMap: Record<string, { fd?: number; cz?: number }>,
  saAvgMap:  Record<string, { fd?: number; cz?: number }>,
  pikkitMap: Record<string, any>,
  openingMap: Record<string, { sa_open: number | null; rbi_open: number | null }>,
  hrMap: Record<string, any[]>,
  nearMap: Record<string, any>,
  batterPitchMap: BatterPitchMap,
  pitcherPitchMap: PitcherPitchMap,
  platoonMap: PlatoonMap
) {
  const idKey = String(player.mlb_id || '')
  const nn    = player.name_norm || normName(player.name || '')

  const playerSplits = splitMap.byId[idKey] ?? splitMap.byName[nn]
  const handSplits = playerSplits?.[pitcherHand]
    ?? playerSplits?.['R']
    ?? (playerSplits ? Object.values(playerSplits)[0] : null)
  const se = (handSplits as any)?.season ?? null
  const re = (handSplits as any)?.recent ?? null

  const s_spd = nv(se?.avg_bat_speed)
  const s_hrd = nv(se?.hard_swing_rate)
  const s_sq  = nv(se?.squared_up_per_swing)
  const s_bla = nv(se?.blast_per_swing)
  const s_len = nv(se?.swing_length)
  const s_atk = nv(se?.attack_angle)
  const s_iaa = nv(se?.ideal_attack_angle_rate)
  const s_tlt = nv(se?.swing_tilt)
  const s_ev  = nv(se?.exit_velocity_avg)
  const s_la  = nv(se?.launch_angle_avg)
  const s_brl = nv(se?.barrel_batted_rate)
  const s_hh  = nv(se?.hard_hit_pct)
  const s_pa  = nv(se?.pull_air_rate)
  const s_fb  = nv(se?.fb_rate)
  const s_xhr = nv(se?.xhr)
  const s_hr  = nv(se?.hr_total)

  const r_spd = nv(re?.avg_bat_speed)
  const r_sq  = nv(re?.squared_up_per_swing)
  const r_bla = nv(re?.blast_per_swing)
  const r_atk = nv(re?.attack_angle)

  const d_spd = r_spd != null && s_spd != null ? r_spd - s_spd : null
  const d_sq  = r_sq  != null && s_sq  != null ? r_sq  - s_sq  : null

  // Switch hitters always bat opposite the pitcher's throwing hand (that's
  // the entire point of switching) — 'S' isn't itself a real hand key in
  // any of the hand-keyed lookup tables (they only ever have L/R rows), so
  // using player.bats directly here would silently miss every switch
  // hitter's actual platoon side. Use the real side they're standing on
  // for THIS specific pitcher for every hand-dependent lookup below.
  const effectiveBats = player.bats === 'S' ? (pitcherHand === 'L' ? 'R' : 'L') : (player.bats || 'R')

  const pitRow = pickPitcherRow(pitcherMap, pitcherId, effectiveBats)
  const { s_timing, r_timing, s_miss, r_miss } =
    computeTiming(idKey, nn, pitcherHand, pitRow, timingMap)

  const matchup_edge = computeMatchupEdge(nn, pitcherHand, effectiveBats, pitRow, batterPitchMap, pitcherPitchMap)
  const platoonSplit = pitcherHand === 'L' ? platoonMap[idKey]?.vl : platoonMap[idKey]?.vr
  const platoon_ops = platoonSplit?.ops != null ? Number(platoonSplit.ops) : null

  // How many real recent pitches we actually have on this guy — a proxy for
  // "does he play enough for his season rate stats to mean anything." A
  // rarely-used bench bat can post a 25% season barrel rate off 3-4 total
  // batted balls, which is noise, not signal, but a z-score has no idea
  // that's different from an everyday player's 25% off 200 batted balls.
  // Used to dampen paper score for anyone we barely have data on, in
  // computePaper below.
  const recent_pitch_count = Object.values(batterPitchMap[nn] ?? {})
    .reduce((sum, byHand) => sum + Object.values(byHand).reduce((s2, r: any) => s2 + (r.pitches || 0), 0), 0)

  const props      = player.props
  const fhr_fd     = props?.fhr?.fanduel      ?? null
  const fhr_cz     = props?.fhr?.caesars      ?? null
  const sa_fd      = props?.sa?.fanduel       ?? null
  const sa_cz      = props?.sa?.caesars       ?? null
  const sa_mgm     = props?.sa?.betmgm        ?? null
  const sng_fd     = props?.singles?.fanduel  ?? null
  const dbl_fd     = props?.doubles?.fanduel  ?? null
  const rbi_fd     = props?.rbi?.fanduel      ?? null
  const rbi2_fd    = props?.rbi2?.fanduel     ?? null
  const rbi3_fd    = props?.rbi3?.fanduel     ?? null
  const tb4_fd     = props?.tb4?.fanduel      ?? null
  const tb5_fd     = props?.tb5?.fanduel      ?? null
  const hr2_fd     = props?.hr2?.fanduel      ?? null
  const tri_fd     = props?.triples?.fanduel  ?? null
  const hrr_fd     = props?.hrr?.fanduel      ?? null
  // FanDuel-only markets BDL doesn't carry — backfilled via the admin
  // fanduel-import tool (console scraper paste), see /admin/fanduel-import.
  const laser105_fd = props?.laser105?.fanduel ?? null
  const laser110_fd = props?.laser110?.fanduel ?? null
  const moonshot_fd = props?.moonshot?.fanduel ?? null
  const pa1_fd       = props?.pa1?.fanduel      ?? null
  const hrMl_fd      = props?.hrMl?.fanduel     ?? null
  // Opening/early snapshots for the same gap markets — for delta arrows.
  const open = props?.open ?? {}
  const fhr_open      = open.fhr      ?? null
  const saFd_open      = open.saFd     ?? null
  const hr2Fd_open     = open.hr2Fd    ?? null
  const sngFd_open     = open.sngFd    ?? null
  const dblFd_open     = open.dblFd    ?? null
  const triFd_open     = open.triFd    ?? null
  const rbiFd_open     = open.rbiFd    ?? null
  const rbi2Fd_open    = open.rbi2Fd   ?? null
  const rbi3Fd_open    = open.rbi3Fd   ?? null
  const tb4Fd_open     = open.tb4Fd    ?? null
  const tb5Fd_open     = open.tb5Fd    ?? null
  const hrrFd_open     = open.hrrFd    ?? null
  const laser105_open = open.laser105 ?? null
  const laser110_open = open.laser110 ?? null
  const moonshot_open = open.moonshot ?? null
  const pa1_open       = open.pa1      ?? null
  const hrMl_open      = open.hrMl     ?? null
  const saMgm_open     = open.saMgm    ?? null
  const hr2Mgm_open    = open.hr2Mgm   ?? null

  const div        = fdczDiv(fhr_fd, fhr_cz)
  const fhr_div_sa = implRatio(fhr_fd, sa_fd)
  const m_div_f    = implRatio(sa_mgm, sa_fd)
  const sa_div_rbi = implRatio(sa_fd, rbi_fd)
  const sa_div_rbi2 = implRatio(sa_fd, rbi2_fd)
  const sa_div_rbi3 = implRatio(sa_fd, rbi3_fd)
  const sa_div_tb4  = implRatio(sa_fd, tb4_fd)
  const sa_div_tb5  = implRatio(sa_fd, tb5_fd)
  const sa_div_hr2  = implRatio(sa_fd, hr2_fd)
  const sa_div_hrr  = implRatio(sa_fd, hrr_fd)
  const pa1_div_sa  = implRatio(pa1_fd, sa_fd)
  const sa_div_ml   = implRatio(sa_fd, hrMl_fd)

  // ─ Ported from mlb-party builder: "POWER VEHICLE" gate on the SNG/DBL/TRI
  // group. Uses the builder's own simplified (odds+100) ratio, not our
  // implied-probability implRatio — matching their exact thresholds.
  const rawRatio = (a: number | null, b: number | null) =>
    a != null && b != null ? Math.round(((a + 100) / (b + 100)) * 10) / 10 : null
  const pv_ratio     = rawRatio(sa_fd, dbl_fd)
  const sa_tb4_gate  = rawRatio(sa_fd, tb4_fd)
  const is_pwr = pv_ratio != null && pv_ratio >= 1.35 && pv_ratio <= 1.60
              && sa_tb4_gate != null && sa_tb4_gate <= 3.8

  // "Players To Combine For A/2+ Home Run(s)" — FanDuel-only, manually
  // imported (see /admin/fanduel-import). Use MIN combo price per mlb-party's
  // own reasoning: the cheapest pairing = strongest book conviction this
  // specific player is the one who goes deep, so SA÷C ratio uses the raw
  // (odds+100) formula like the other combo/power gates, not implRatio.
  const combo1_min      = props?.combo1Min      ?? null
  const combo1_count    = props?.combo1Count    ?? null
  const combo1_partners = props?.combo1Partners ?? null
  const combo2_min      = props?.combo2Min      ?? null
  const combo2_count    = props?.combo2Count    ?? null
  const combo2_partners = props?.combo2Partners ?? null
  const sa_div_c1 = rawRatio(sa_fd, combo1_min)
  const sa_div_c2 = rawRatio(sa_fd, combo2_min)

  // "💰SA÷RBI" value flag — copied exactly from mlb-party's builder: computed
  // off OPENING FanDuel odds (the very first price posted that day), NOT live
  // odds. Opening lines barely move, so crossing 3.5x is rare (~1/game);
  // live odds drift constantly and cross it far more often, which is why an
  // earlier version of this (using sa_fd/rbi_fd directly) over-fired.
  const opening = openingMap[nn]
  const sa_rbi_raw_ratio = rawRatio(opening?.sa_open ?? null, opening?.rbi_open ?? null)
  const picks_count = (pikkitMap[nn]?.picks as number | undefined) ?? null
  const is_money_sa_rbi = sa_rbi_raw_ratio != null && sa_rbi_raw_ratio >= 3.5
                        && picks_count != null && picks_count <= 50

  return {
    mlb_id:        player.mlb_id as number | null,
    name:          player.name   as string,
    name_norm:     nn,
    batting_order: player.batting_order as number,
    position:      player.position as string,
    bats:          player.bats    as string,
    team:          player.team    as string,
    fhr_fd, fhr_cz, div, fhr_div_sa,
    // Shade %: today's price vs own season-average price (negative = cheaper
    // than usual = book conviction). Ported exactly from mlb-party: FHR% only
    // compares FanDuel-to-FanDuel; HR% (SA) falls back to Caesars if FD's own
    // average is missing.
    fhr_pct: (() => {
      const avgFd = fhrAvgMap[nn]?.fd
      return fhr_fd != null && avgFd ? (fhr_fd - avgFd) / avgFd : null
    })(),
    sa_pct: (() => {
      const av = saAvgMap[nn] ?? {}
      if (sa_fd != null && av.fd) return (sa_fd - av.fd) / av.fd
      if (sa_fd != null && av.cz) return (sa_fd - av.cz) / av.cz
      return null
    })(),
    sa_fd, sa_cz, sa_mgm, m_div_f,
    sa_div_rbi, sa_div_rbi2, sa_div_rbi3, sa_div_tb4, sa_div_tb5, sa_div_hr2, sa_div_hrr,
    sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb4_fd, tb5_fd, hr2_fd, hrr_fd,
    laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hrMl_fd, pa1_div_sa, sa_div_ml,
    fhr_open, saFd_open, hr2Fd_open, sngFd_open, dblFd_open, triFd_open, rbiFd_open, rbi2Fd_open, rbi3Fd_open, tb4Fd_open, tb5Fd_open, hrrFd_open,
    laser105_open, laser110_open, moonshot_open, pa1_open, hrMl_open, saMgm_open, hr2Mgm_open,
    combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners, sa_div_c1, sa_div_c2,
    is_pwr, is_money_sa_rbi,
    rawProps: props ?? null,
    s_spd, s_hrd, s_sq, s_bla, s_len, s_atk, s_iaa, s_tlt,
    s_ev, s_la, s_brl, s_hh, s_pa, s_fb, s_xhr, s_hr,
    r_spd, r_sq, r_bla, r_atk,
    d_spd, d_sq,
    s_timing, r_timing, s_miss, r_miss,
    matchup_edge, platoon_ops, recent_pitch_count,
    pk:      pikkitMap[nn] ?? null,
    hr_hits: hrMap[nn]    ?? [],
    near_hr: nearMap[nn]  ?? null,
    paper: null as number | null,
    bk_rk: null as number | null,
    pp_rk: null as number | null,
    mm:    null as number | null,
  }
}

type BatterRow = ReturnType<typeof buildBatterRow>

// ─── paper score ─────────────────────────────────────────────────────────────
function computePaper(rows: BatterRow[]) {
  // matchup_edge carries the heaviest weight on purpose: it's the only
  // feature here that actually looks at TONIGHT's specific pitcher (recent
  // pitch-type-level results on both sides), everything else is the
  // batter's own generic season/recent form in a vacuum. Before this, paper
  // could rank a good hitter with no real matchup edge above someone who'd
  // actually just done damage against exactly what tonight's pitcher throws
  // — which is the whole point of a "who's going deep tonight" score.
  const feats: Array<{ s: keyof BatterRow; r: keyof BatterRow | null; w: number; neg?: boolean }> = [
    { s: 'matchup_edge', r: null,       w: 0.26 },
    { s: 's_brl',        r: null,       w: 0.20 },
    { s: 's_spd',        r: 'r_spd',    w: 0.15 },
    { s: 'platoon_ops',  r: null,       w: 0.12 },
    { s: 's_pa',         r: null,       w: 0.12 },
    { s: 's_sq',         r: 'r_sq',     w: 0.08 },
    { s: 's_hh',         r: null,       w: 0.04 },
    { s: 's_ev',         r: null,       w: 0.02 },
    { s: 's_timing',     r: 'r_timing', w: 0.01 },
  ]
  const blend = (row: BatterRow, f: typeof feats[0]): number | null => {
    const sv = row[f.s] as number | null
    const rv = f.r ? row[f.r] as number | null : null
    if (rv != null && sv != null) return 0.7 * rv + 0.3 * sv
    return rv ?? sv ?? null
  }
  const stats: Record<string, { m: number; sd: number }> = {}
  for (const f of feats) {
    const vals = rows.map(r => blend(r, f)).filter((x): x is number => x != null)
    const m  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) : 1
    stats[String(f.s)] = { m, sd: sd || 1 }
  }
  for (const r of rows) {
    let p = 0, tw = 0
    for (const f of feats) {
      const v = blend(r, f)
      const { m, sd } = stats[String(f.s)]
      if (v != null && sd > 0) {
        const z = (v - m) / sd
        p  += f.w * (f.neg ? -z : z)
        tw += f.w
      }
    }
    const raw = tw > 0 ? p / tw : null
    // Confidence dampening: a bench bat with a handful of recent pitches can
    // post a wild season rate stat (e.g. 25% barrel rate off 3 batted balls)
    // that z-scores identically to an everyday player's stable 25% off 200 —
    // the z-score math has no idea one is noise and the other is signal.
    // Scale the final score toward 0 (neutral) the less recent data we
    // actually have on this player, using batter_pitch_type_recent's real
    // pitch counts as the confidence signal. 40 recent pitches ≈ full
    // confidence; below that, dampen proportionally.
    const confidence = Math.min(1, (r.recent_pitch_count ?? 0) / 40)
    r.paper = raw != null ? Math.round(raw * confidence * 1000) / 1000 : null
  }
}

function computeRanks(rows: BatterRow[]) {
  const bk = [...rows].filter(r => r.sa_fd != null)
    .sort((a, b) => (toImpl(b.sa_fd) ?? 0) - (toImpl(a.sa_fd) ?? 0))
  bk.forEach((r, i) => { r.bk_rk = i + 1 })

  const pp = [...rows].filter(r => r.paper != null)
    .sort((a, b) => (b.paper ?? 0) - (a.paper ?? 0))
  pp.forEach((r, i) => { r.pp_rk = i + 1 })

  for (const r of rows) {
    if (r.bk_rk != null && r.pp_rk != null) r.mm = r.bk_rk - r.pp_rk
  }
}

// ─── heat ─────────────────────────────────────────────────────────────────────
function heat(v: number | null, all: (number | null)[], dir: 'hi' | 'lo' = 'hi'): React.CSSProperties {
  if (v == null) return {}
  const vals = all.filter((x): x is number => x != null)
  if (vals.length < 3) return {}
  const mn = Math.min(...vals), mx = Math.max(...vals)
  if (mx === mn) return {}
  let t = (v - mn) / (mx - mn)
  if (dir === 'lo') t = 1 - t
  if (t < 0.33) return { background: `rgba(239,68,68,${0.05 + (0.33 - t) * 0.55})` }
  if (t > 0.66) return { background: `rgba(74,222,128,${0.05 + (t - 0.66) * 0.65})` }
  return {}
}

function oddsHeat(v: number | null, all: (number | null)[]): React.CSSProperties {
  if (v == null) return {}
  const impls = all.map(toImpl).filter((x): x is number => x != null)
  const mine  = toImpl(v)
  if (mine == null || impls.length < 2) return {}
  const mn = Math.min(...impls), mx = Math.max(...impls)
  if (mx === mn) return {}
  const t = (mine - mn) / (mx - mn)
  if (t < 0.5) return {}
  return { background: `rgba(20,147,255,${0.05 + t * 0.18})` }
}

// ─── MLB assets ───────────────────────────────────────────────────────────────
const TEAM_IDS: Record<string, number> = {
  ARI:109,AZ:109,ATL:144,BAL:110,BOS:111,CHC:112,CWS:145,CIN:113,CLE:114,COL:115,
  DET:116,HOU:117,KC:118,LAA:108,LAD:119,MIA:146,MIL:158,MIN:142,NYM:121,
  NYY:147,ATH:133,OAK:133,PHI:143,PIT:134,SD:135,SF:137,SEA:136,STL:138,
  TB:139,TEX:140,TOR:141,WSH:120,
}

function TeamLogo({ abbr, size = 20 }: { abbr: string; size?: number }) {
  const [err, setErr] = useState(false)
  const id = TEAM_IDS[abbr]
  if (!id || err) return <span style={{ fontSize: size * 0.55, fontWeight: 700, color: 'var(--text-3)', fontFamily: 'monospace' }}>{abbr}</span>
  return <img src={`https://www.mlbstatic.com/team-logos/${id}.svg`} alt={abbr} onError={() => setErr(true)} style={{ width: size, height: size, objectFit: 'contain' }} />
}

function PlayerAvatar({ mlbId, size = 24, teamAbbr, name }: { mlbId: number | null; size?: number; teamAbbr?: string | null; name?: string }) {
  if (!mlbId) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface-2)', flexShrink: 0 }} />
  return (
    <SharedPlayerAvatar
      headshot={mlbHeadshot(mlbId)}
      teamLogo={getTeamLogoUrl(teamAbbr)}
      teamAbbr={teamAbbr}
      name={name}
      size={size}
      showTeam={!!getTeamLogoUrl(teamAbbr)}
    />
  )
}

// ─── table style constants ────────────────────────────────────────────────────
const STH: React.CSSProperties = {
  padding: '4px 2px', textAlign: 'center',
  fontSize: 9, fontWeight: 700, color: 'var(--text-2)',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  background: 'var(--bg)', borderBottom: '2px solid var(--border)',
  fontFamily: "'SF Mono',ui-monospace,monospace",
  cursor: 'pointer', userSelect: 'none',
}
const STD: React.CSSProperties = {
  padding: '3px 2px', textAlign: 'center',
  fontSize: 10, color: 'var(--text-1)',
  fontFamily: "'SF Mono',ui-monospace,monospace",
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}
const SNULL: React.CSSProperties = { ...STD, color: 'var(--text-3)' }
const SDIV_H: React.CSSProperties = { width: 5, minWidth: 5, padding: 0, background: 'var(--bg)', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)' }
const SDIV_D: React.CSSProperties = { width: 5, minWidth: 5, padding: 0, borderRight: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.04)' }

type SortState = { col: string; dir: 'desc' | 'asc' } | null

function TH({ label, title, w = 40, sticky = false, sortKey, sortState, onSort }: {
  label: React.ReactNode; title?: string; w?: number; sticky?: boolean
  sortKey?: string; sortState?: SortState; onSort?: (key: string) => void
}) {
  const active = !!sortKey && sortState?.col === sortKey
  // The sticky Player column (only sticky=true caller) gets a narrower fixed
  // width on mobile to match its <td>, so more of the ~60 scrollable stat
  // columns fit on screen — inline width has to move to a className for that
  // one column since inline styles always win over responsive Tailwind classes.
  const responsiveSticky = sticky && w === 190
  return (
    <th
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
      className={responsiveSticky ? 'w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]' : undefined}
      style={{
        ...STH,
        ...(responsiveSticky ? {} : { width: w, minWidth: w, maxWidth: w }),
        ...(sticky ? { position: 'sticky', left: 0, zIndex: 4 } : {}),
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      <Tooltip content={title ?? ''}>
        <span>{label}{active ? (sortState!.dir === 'desc' ? '▼' : '▲') : ''}</span>
      </Tooltip>
    </th>
  )
}

// ─── pitch drill-down panel ───────────────────────────────────────────────────
function PitcherStrikeoutsChip({ oppPitcher, gameInfo }: {
  oppPitcher: any
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
}) {
  const wl = useWatchlist()
  const [busy, setBusy] = useState(false)
  const props = oppPitcher?.props
  const line = props?.pitcher_strikeouts_line?.fanduel
  const odds = props?.pitcher_strikeouts?.fanduel
  if (!oppPitcher || odds == null) return null

  const propKey = 'pitcher_strikeouts'
  const label = `Pitcher ${line != null ? `${line}+ ` : ''}Strikeouts`
  const saved = wl.isSaved(oppPitcher.id ?? null, propKey, 'fanduel')

  const handleClick = async () => {
    if (saved || busy || !wl.signedIn) return
    setBusy(true)
    try {
      await wl.add({
        sport: gameInfo.sport,
        game_pk: gameInfo.game_pk,
        game_date: gameInfo.game_date,
        mlb_id: oppPitcher.id ?? null,
        player_name: oppPitcher.name,
        team: null,
        position: 'P',
        bats: oppPitcher.hand ?? null,
        headshot_url: oppPitcher.id ? mlbHeadshot(oppPitcher.id) : null,
        prop_key: propKey,
        prop_label: label,
        line: line != null ? String(line) : null,
        book: 'fanduel',
        odds,
        odds_by_book: props.pitcher_strikeouts,
      })
    } finally {
      setBusy(false)
    }
  }

  const pill = (
    <div
      onClick={handleClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
        padding: '4px 8px', borderRadius: 6, background: 'var(--surface-2)',
        cursor: wl.signedIn ? 'pointer' : 'default', fontSize: 10,
        color: saved ? 'var(--accent)' : 'var(--text-2)', fontWeight: saved ? 700 : 600,
      }}
    >
      <BookLogo vendor="fanduel" size={12} />
      {oppPitcher.name} — {label} {oStr(odds)}
      {saved && <span style={{ fontSize: 9 }}>★ saved</span>}
    </div>
  )

  return wl.signedIn ? (
    <Tooltip content={saved ? 'Saved to watchlist' : 'Click to add to watchlist'}>{pill}</Tooltip>
  ) : pill
}

function PlayerDrillDown({
  row, pitcherRow, timingMap, oppPitcher, gameInfo, batterPitchMap, pitcherPitchMap, gameLogMap, platoonMap, pitchEventsMap,
  windowMode, liveN, onSetWindowMode, onSetLiveN, liveEntry,
  lineupPlayer, pitcherTeamAbbr, pitcherTeamName, lineupConfirmed, splitMap, pitcherMap, pikkitMap, pool,
}: {
  row: BatterRow
  pitcherRow: any
  timingMap: TimingMap
  oppPitcher?: any
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  batterPitchMap: BatterPitchMap
  pitcherPitchMap: PitcherPitchMap
  gameLogMap: GameLogMap
  platoonMap: PlatoonMap
  pitchEventsMap: PitchEventsMap
  windowMode: '14day' | 'live'
  liveN: number
  onSetWindowMode: (m: '14day' | 'live') => void
  onSetLiveN: (n: number) => void
  liveEntry?: { status: 'loading' | 'ready' | 'error'; data?: any; error?: string }
  // Matchup card — reuses Pitcher Report's actual PitchMixTable/
  // BatterVsPitchTable components, scoped to this one batter vs this one
  // pitcher, instead of the condensed columns above.
  lineupPlayer: any
  pitcherTeamAbbr: string
  pitcherTeamName: string
  lineupConfirmed: boolean
  splitMap: SplitMap
  pitcherMap: PitcherMap
  pikkitMap: Record<string, any>
  // Heat-maps the Bat Tracking tiles against the rest of tonight's lineups —
  // same "heat-mapped vs the rest of this lineup" convention as Pitcher
  // Report's PlayerStatcastDetail.
  pool: BatterRow[]
}) {
  const [expandedPitch, setExpandedPitch] = useState<string | null>(null)
  const [mixSort, setMixSort] = useState<MatchupSortState>(null)
  const onSortMix = (col: string) => setMixSort(prev => toggleMatchupSort(prev, col))
  const pitcherHand = pitcherRow?.pitch_hand || 'R'
  // pct_* columns come out of mlb-party already scaled as percentages
  // (44.2 meaning 44.2%), not fractions — same quirk as barrel_batted_rate/
  // hard_hit_pct elsewhere in this file. No *100 here.
  // Note: there's no pct_sweeper column in pitcher_statcast_splits at all —
  // an earlier version of this fell back to pct_slider for it, which just
  // silently duplicated the Slider row under a fake "Sweeper" label.
  const mix14day = ([
    ['FF', pitcherRow?.pct_fastball  || 0],
    ['SI', pitcherRow?.pct_sinker    || 0],
    ['FC', pitcherRow?.pct_cutter    || 0],
    ['SL', pitcherRow?.pct_slider    || 0],
    ['CU', pitcherRow?.pct_curveball || 0],
    ['CH', pitcherRow?.pct_changeup  || 0],
    ['FS', pitcherRow?.pct_splitter  || 0],
  ] as [string, number][]).filter(([, p]) => p > 4) // >4% usage — negligible/scratch pitches otherwise

  const idKey = String(row.mlb_id || '')
  const pitcherIdKey = String(pitcherRow?.mlb_id || '')
  // Switch hitters bat opposite the pitcher's throwing hand — 'S' isn't a
  // real key in any hand-keyed lookup table, so use the actual side they're
  // standing on against this specific pitcher for every lookup below.
  const effectiveBats = row.bats === 'S' ? (pitcherHand === 'L' ? 'R' : 'L') : (row.bats || 'R')

  // Live mode: same "this batter's own last N games, this pitcher's own
  // last N starts, computed live from MLB play-by-play" the Pitcher Report
  // page offers, surfaced here per-matchup instead of needing to go look the
  // pitcher up separately. pitchLog.ts's aggregate rows use the same field
  // names (pitches/hard_hit_pct/whiff_pct/...) as the mlb-party 14-day
  // tables below, so batEdge/pitEdge/risk all work unmodified regardless of
  // which source fed them.
  const useLive = windowMode === 'live' && liveEntry?.status === 'ready' && !!liveEntry.data
  const liveMixRows: any[] = useLive ? (liveEntry!.data.pitcherRows?.[effectiveBats] ?? []) : []
  const liveMixByType: Record<string, any> = Object.fromEntries(liveMixRows.map((r: any) => [r.pitch_type, r]))
  const liveBatterRows: Record<string, { R?: any; L?: any }> = useLive ? (liveEntry!.data.batters?.[idKey] ?? {}) : {}

  const mix = useLive
    ? liveMixRows.map((r: any): [string, number] => [r.pitch_type, r.usage_pct ?? 0]).filter(([, p]: [string, number]) => p > 4)
    : mix14day

  const gameLogs = gameLogMap[idKey] ?? []
  const l5 = rollupGames(gameLogs, 5)
  const l10 = rollupGames(gameLogs, 10)
  const platoon = platoonMap[idKey]
  // pitcherHand is the pitcher THIS batter is actually facing today — the
  // relevant platoon split is "how has this batter hit lefties/righties all
  // season," which side depends on who's on the mound tonight.
  const platoonRow = pitcherHand === 'L' ? platoon?.vl : platoon?.vr

  const rows = mix.map(([pt, pct]) => {
    const tRows = timingMap.byId[idKey]?.[pitcherHand]?.[pt]
              || timingMap.byName[row.name_norm]?.[pitcherHand]?.[pt]
    const se = (tRows as any)?.season
    const re = (tRows as any)?.recent

    // The real matchup edge: this batter's own recent results against THIS
    // exact pitch type from THIS exact pitcher-hand, next to this pitcher's
    // own recent results throwing THIS exact pitch type to THIS exact
    // batter-hand. In live mode both sides are the pitcher's actual last N
    // starts / this batter's actual last N games, computed from raw MLB
    // play-by-play; in 14-day mode (default) both come from mlb-party's
    // pre-aggregated tables — see ingest-pitch-type-recency.
    const batEdge = useLive
      ? ((liveBatterRows[pt] as any)?.[pitcherHand] ?? null)
      : (batterPitchMap[row.name_norm]?.[pt]?.[pitcherHand] ?? null)
    const pitEdge = useLive
      ? (liveMixByType[pt] ?? null)
      : (pitcherPitchMap[pitcherIdKey]?.[pt]?.[effectiveBats] ?? null)

    // Danger zone: batter is squaring this pitch up recently (hard-hit% high,
    // whiff% low) AND this pitcher has been getting hit hard on it recently
    // too — both signals agreeing, not just one side's noise. Falls back to
    // the older on-time-percent proxy when there isn't enough recent-sample
    // data yet (batter_pitch_type_recent/pitcher_pitch_type_recent both
    // require actual pitches thrown in the last 14 days to have a row).
    let risk: 'batter' | 'pitcher' | null = null
    if (batEdge && pitEdge && batEdge.pitches >= 8 && pitEdge.pitches >= 8) {
      const batHot = (batEdge.hard_hit_pct ?? 0) >= 40 && (batEdge.whiff_pct ?? 100) <= 30
      const pitWeak = (pitEdge.hard_hit_pct ?? 0) >= 40 && (pitEdge.whiff_pct ?? 100) <= 20
      const batCold = (batEdge.whiff_pct ?? 0) >= 40
      const pitStrong = (pitEdge.whiff_pct ?? 0) >= 30
      if (pct >= 12 && batHot && pitWeak) risk = 'batter'
      else if (pct >= 12 && batCold && pitStrong) risk = 'pitcher'
    } else {
      // "Does the batter actually do damage against THIS specific pitch" — the
      // thing the raw numbers don't make obvious on their own. Prefer recent
      // form over season if we have it; a pitch thrown often (≥15% mix) that
      // the batter is on-time against is where their pop is most likely to
      // come from tonight. Low on-time on a heavily-used pitch = the pitcher's
      // best weapon against this batter specifically.
      const recognition = re?.on_time_percent ?? se?.on_time_percent ?? null
      risk = pct >= 15 && recognition != null
        ? (recognition >= 0.55 ? 'batter' : recognition <= 0.35 ? 'pitcher' : null)
        : null
    }
    return { pt, pct, se, re, risk, batEdge, pitEdge }
  })

  const mixActiveSort = mixSort ?? { col: 'pct', dir: 'desc' as const }
  const sortedRows = [...rows].sort((a, b) => {
    switch (mixActiveSort.col) {
      case 'pct': return cmpMatchupNullsLast(a.pct, b.pct, mixActiveSort.dir)
      case 'bat_hh': return cmpMatchupNullsLast(a.batEdge?.hard_hit_pct ?? null, b.batEdge?.hard_hit_pct ?? null, mixActiveSort.dir)
      case 'pit_hh': return cmpMatchupNullsLast(a.pitEdge?.hard_hit_pct ?? null, b.pitEdge?.hard_hit_pct ?? null, mixActiveSort.dir)
      case 'on_time': return cmpMatchupNullsLast(a.se?.on_time_percent ?? null, b.se?.on_time_percent ?? null, mixActiveSort.dir)
      case 'r_on_time': return cmpMatchupNullsLast(a.re?.on_time_percent ?? null, b.re?.on_time_percent ?? null, mixActiveSort.dir)
      case 'miss': return cmpMatchupNullsLast(a.se?.miss_distance ?? null, b.se?.miss_distance ?? null, mixActiveSort.dir)
      case 'r_miss': return cmpMatchupNullsLast(a.re?.miss_distance ?? null, b.re?.miss_distance ?? null, mixActiveSort.dir)
      default: return cmpMatchupNullsLast(a.pct, b.pct, mixActiveSort.dir)
    }
  })
  // Heat-map pools for the pitch-mix table — green = favors the batter/bettor
  // (harder contact, better recognition, closer misses), red = favors the
  // pitcher, same convention PitchMixTable itself uses.
  const batHhPool = rows.map(r => r.batEdge?.hard_hit_pct ?? null)
  const pitHhPool = rows.map(r => r.pitEdge?.hard_hit_pct ?? null)
  const onTimePool = rows.map(r => r.se?.on_time_percent ?? null)
  const rOnTimePool = rows.map(r => r.re?.on_time_percent ?? null)
  const missPool = rows.map(r => r.se?.miss_distance ?? null)
  const rMissPool = rows.map(r => r.re?.miss_distance ?? null)

  const noBatSplits = !row.s_spd && !row.s_brl

  // Full pitch-mix rows for just the hand this batter is actually facing —
  // same two sources (live-computed vs 14-day mlb-party) as the condensed
  // table above, just unfiltered by the >4%-usage cutoff since PitchMixTable
  // does its own display/sort, not a top-N summary.
  const matchupMixRows: any[] = useLive
    ? liveMixRows
    : Object.values(pitcherPitchMap[pitcherIdKey] ?? {}).map((byHand: any) => byHand?.[effectiveBats]).filter(Boolean)

  // Same auto-pick as Pitcher Report: ranked by barrel%+hard-hit% among
  // pitches with a real sample, top 2 — "what's actually live against him
  // right now," not just what he throws most.
  const matchupHotPitches = useMemo(() => {
    const eligible = matchupMixRows.filter((r: any) => (r.pitches ?? 0) >= 10)
    return [...eligible].sort((a: any, b: any) =>
      ((b.barrel_pct ?? 0) * 1.5 + (b.hard_hit_pct ?? 0)) - ((a.barrel_pct ?? 0) * 1.5 + (a.hard_hit_pct ?? 0))
    ).slice(0, 2).map((r: any) => r.pitch_type as string)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchupMixRows.map((r: any) => `${r.pitch_type}:${r.pitches}:${r.barrel_pct}:${r.hard_hit_pct}`).join('|')])

  const [matchupPinned, setMatchupPinned] = useState<Set<string>>(new Set())
  const onToggleMatchupPin = (_hand: 'R' | 'L', pt: string) => setMatchupPinned(prev => {
    const next = new Set(prev)
    if (next.has(pt)) next.delete(pt); else next.add(pt)
    return next
  })
  const matchupShownTypes = matchupPinned.size > 0 ? Array.from(matchupPinned) : matchupHotPitches
  const matchupGetRow = (pitchType: string) => (_b: any) => useLive
    ? ((liveBatterRows[pitchType] as any)?.[pitcherHand] ?? null)
    : (batterPitchMap[row.name_norm]?.[pitchType]?.[pitcherHand] ?? null)

  return (
    <td colSpan={99} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

        {/* Pitch mix + timing */}
        {pitcherRow ? (
          <div style={{ minWidth: 420 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                PITCH MIX &amp; TIMING · vs {pitcherHand}HP
              </div>
              {/* Same Last-N-Starts/Games live window as Pitcher Report, just
                  surfaced per-matchup here instead of needing a separate trip
                  to that page — shared per game (not per row) via GameTable's
                  liveCache, so switching between two batters facing the same
                  pitcher doesn't refetch. */}
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', marginLeft: 'auto' }}>
                <button onClick={() => onSetWindowMode('14day')} style={{ padding: '2px 7px', fontSize: 8, fontWeight: 700, border: 'none', cursor: 'pointer', background: windowMode === '14day' ? 'var(--accent-dim)' : 'var(--surface)', color: windowMode === '14day' ? 'var(--accent)' : 'var(--text-3)' }}>14-Day</button>
                <button onClick={() => onSetWindowMode('live')} style={{ padding: '2px 7px', fontSize: 8, fontWeight: 700, border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', background: windowMode === 'live' ? 'var(--accent-dim)' : 'var(--surface)', color: windowMode === 'live' ? 'var(--accent)' : 'var(--text-3)' }}>Live N</button>
              </div>
              {windowMode === 'live' && (
                <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                  {[3, 5, 10].map(n => (
                    <button key={n} onClick={() => onSetLiveN(n)} style={{ padding: '2px 6px', fontSize: 8, fontWeight: 700, border: 'none', borderLeft: n !== 3 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: liveN === n ? 'var(--accent-dim)' : 'var(--surface)', color: liveN === n ? 'var(--accent)' : 'var(--text-3)' }}>N={n}</button>
                  ))}
                </div>
              )}
            </div>
            {windowMode === 'live' ? (
              <div style={{ fontSize: 8, color: liveEntry?.status === 'error' ? '#f87171' : 'var(--text-4)', marginBottom: 4 }}>
                {liveEntry?.status === 'loading' || !liveEntry
                  ? 'Computing from MLB play-by-play…'
                  : liveEntry.status === 'error'
                  ? liveEntry.error
                  : `Sample: pitcher's last ${liveEntry.data.window.games} starts (${liveEntry.data.window.dateFrom} – ${liveEntry.data.window.dateTo}) · Mix%/Bat·HH%/Pit·HH% below are live-computed · batter side uses ${row.bats === 'S' ? row.bats : row.bats + 'HB'}'s own last ${liveN} games vs ${pitcherHand}HP (any opponent)`}
              </div>
            ) : (
              /* Mix% is this pitcher's overall usage — Baseball Savant's arsenal-stats
                 leaderboard doesn't offer a split by opposing batter side, so this
                 number is the same regardless of who's up. OnTime%/Miss ARE real:
                 this batter's own recognition numbers against {pitcherHand}HP pitchers
                 specifically, via batter_timing_splits. */
              <div style={{ fontSize: 8, color: 'var(--text-4)', marginBottom: 4 }}>
                Mix% = season-wide usage (not split by batter side) · OnTime%/Miss = {row.bats}HB's own recognition vs {pitcherHand}HP
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5, fontSize: 8, color: 'var(--text-3)' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                batter sees it well — damage risk
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', display: 'inline-block' }} />
                pitcher's weapon vs this batter
              </span>
            </div>
            <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>PITCH</th>
                  <SortableTH label="MIX%" colKey="pct" sort={mixActiveSort} onSort={onSortMix} />
                  <th onClick={() => onSortMix('bat_hh')} style={{ textAlign: 'right', padding: '6px 8px', color: mixActiveSort.col === 'bat_hh' ? 'var(--accent)' : 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    <Tooltip content="Batter's own hard-hit% on this exact pitch type, last 14 days"><span style={{ cursor: 'help' }}>BAT·HH%{mixActiveSort.col === 'bat_hh' ? (mixActiveSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</span></Tooltip>
                  </th>
                  <th onClick={() => onSortMix('pit_hh')} style={{ textAlign: 'right', padding: '6px 8px', color: mixActiveSort.col === 'pit_hh' ? 'var(--accent)' : 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                    <Tooltip content="This pitcher's hard-hit% allowed on this exact pitch type, last 14 days"><span style={{ cursor: 'help' }}>PIT·HH%{mixActiveSort.col === 'pit_hh' ? (mixActiveSort.dir === 'desc' ? ' ▼' : ' ▲') : ''}</span></Tooltip>
                  </th>
                  <SortableTH label="ONTIME%" colKey="on_time" sort={mixActiveSort} onSort={onSortMix} />
                  <SortableTH label="R·OT%" colKey="r_on_time" sort={mixActiveSort} onSort={onSortMix} />
                  <SortableTH label="MISS" colKey="miss" sort={mixActiveSort} onSort={onSortMix} />
                  <SortableTH label="R·MISS" colKey="r_miss" sort={mixActiveSort} onSort={onSortMix} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-3)', fontSize: 11 }}>No pitch mix data</td></tr>
                ) : sortedRows.map(({ pt, pct, se, re, risk, batEdge, pitEdge }) => {
                  const events = pitchEventsMap[idKey]?.[pt]?.[pitcherHand] ?? []
                  const isOpen = expandedPitch === pt
                  return (
                  <React.Fragment key={pt}>
                  <tr
                    onClick={() => events.length && setExpandedPitch(isOpen ? null : pt)}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: risk === 'batter' ? 'rgba(74,222,128,0.08)' : risk === 'pitcher' ? 'rgba(248,113,113,0.08)' : undefined,
                      cursor: events.length ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>
                      {risk && (
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: risk === 'batter' ? '#4ade80' : '#f87171', marginRight: 5, verticalAlign: 'middle' }} />
                      )}
                      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: pitchColor(pt), marginRight: 6, verticalAlign: 'middle' }} />
                      {pitchLabel(pt)}
                      {events.length > 0 && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-3)' }}>{isOpen ? '▲' : '▾'}</span>}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', fontWeight: 700 }}>{pct.toFixed(0)}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(batEdge?.hard_hit_pct ?? null, batHhPool, 'hi') }}>
                      <Tooltip content={batEdge ? `${batEdge.pitches} pitches seen · ${f1(batEdge.whiff_pct)}% whiff · ${batEdge.home_runs ?? 0} HR — click row for the pitch-by-pitch log` : 'No pitches seen off this pitch type recently'} containerClassName="w-full h-full flex items-center justify-center">
                        <span style={{ cursor: 'help' }}>{batEdge?.hard_hit_pct != null ? `${f1(batEdge.hard_hit_pct)}` : '—'}</span>
                      </Tooltip>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(pitEdge?.hard_hit_pct ?? null, pitHhPool, 'hi') }}>
                      <Tooltip content={pitEdge ? `${pitEdge.pitches} pitches thrown · ${f1(pitEdge.whiff_pct)}% whiff induced · ${pitEdge.home_runs_allowed ?? 0} HR allowed` : 'No pitches thrown of this type recently'} containerClassName="w-full h-full flex items-center justify-center">
                        <span style={{ cursor: 'help' }}>{pitEdge?.hard_hit_pct != null ? `${f1(pitEdge.hard_hit_pct)}` : '—'}</span>
                      </Tooltip>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(se?.on_time_percent ?? null, onTimePool, 'hi') }}>
                      {se?.on_time_percent != null ? `${(se.on_time_percent * 100).toFixed(1)}` : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(re?.on_time_percent ?? null, rOnTimePool, 'hi') }}>
                      {re?.on_time_percent != null ? `${(re.on_time_percent * 100).toFixed(1)}` : '—'}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(se?.miss_distance ?? null, missPool, 'lo') }}>
                      {f1(se?.miss_distance ?? null)}
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(re?.miss_distance ?? null, rMissPool, 'lo') }}>
                      {f1(re?.miss_distance ?? null)}
                    </td>
                  </tr>
                  {isOpen && events.length > 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '4px 4px 8px 18px', background: 'rgba(255,255,255,0.015)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 160, overflowY: 'auto' }}>
                          {events.map((e: any, i: number) => {
                            const isSwing = ['swinging_strike', 'swinging_strike_blocked', 'foul', 'foul_tip', 'hit_into_play', 'foul_bunt', 'missed_bunt'].includes(e.description)
                            const label = e.event_label
                              ? e.event_label.replace(/_/g, ' ')
                              : (e.description || '').replace(/_/g, ' ')
                            return (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 8.5, padding: '2px 0', borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
                                <span style={{ color: 'var(--text-3)', width: 62, flexShrink: 0 }}>{e.game_date}</span>
                                <span style={{
                                  color: e.is_home_run ? '#fde047' : isSwing ? 'var(--text-2)' : 'var(--text-3)',
                                  fontWeight: e.is_home_run ? 800 : 400, textTransform: 'capitalize', flex: 1, minWidth: 0,
                                }}>
                                  {e.is_home_run && '🔥 '}{label || '—'}
                                </span>
                                {e.exit_velocity != null && (
                                  <span style={{ color: 'var(--text-2)', flexShrink: 0 }}>{e.exit_velocity}mph{e.launch_angle != null ? ` / ${e.launch_angle}°` : ''}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
            </div>
            <p style={{ fontSize: 8, color: 'var(--text-4)', marginTop: 3 }}>
              Bat·HH%/Pit·HH% = hard-hit rate on/allowing this exact pitch type, last ~20 pitches seen (raw Statcast) · row highlight = both sides agree this pitch is live right now · click a pitch row for the batted-ball log
            </p>
            <PitcherStrikeoutsChip oppPitcher={oppPitcher} gameInfo={gameInfo} />
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>No pitcher data</div>
        )}

        {/* Last N games played (real game-count window, not calendar days)
            + season platoon split vs whichever hand this pitcher throws —
            see ingest-batter-game-logs. */}
        {(l5 || l10 || platoonRow) && (() => {
          const formRows = [
            l5 && { label: `L5 (${l5.games}g)`, avg: l5.avg, ops: l5.ops, hr: l5.hr, bb: l5.bb, so: l5.so },
            l10 && { label: `L10 (${l10.games}g)`, avg: l10.avg, ops: l10.ops, hr: l10.hr, bb: l10.bb, so: l10.so },
            platoonRow && { label: `vs ${pitcherHand}HP (szn)`, avg: platoonRow.avg != null ? Number(platoonRow.avg) : null, ops: platoonRow.ops != null ? Number(platoonRow.ops) : null, hr: platoonRow.hr ?? null, bb: platoonRow.bb ?? null, so: platoonRow.so ?? null },
          ].filter(Boolean) as { label: string; avg: number | null; ops: number | null; hr: number | null; bb: number | null; so: number | null }[]
          const avgPool = formRows.map(r => r.avg)
          const opsPool = formRows.map(r => r.ops)
          const hrPool = formRows.map(r => r.hr)
          const bbPool = formRows.map(r => r.bb)
          const soPool = formRows.map(r => r.so)
          return (
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
              RECENT FORM &amp; SPLITS
            </div>
            <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700, whiteSpace: 'nowrap' }}>WINDOW</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>AVG</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>OPS</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>HR</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>BB</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-3)', fontWeight: 700 }}>SO</th>
                </tr>
              </thead>
              <tbody>
                {formRows.map(r => (
                  <tr key={r.label} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{r.label}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.avg, avgPool, 'hi') }}>{r.avg != null ? r.avg.toFixed(3).replace(/^0/, '') : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.ops, opsPool, 'hi') }}>{r.ops != null ? r.ops.toFixed(3).replace(/^0/, '') : '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.hr, hrPool, 'hi') }}>{r.hr ?? '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.bb, bbPool, 'hi') }}>{r.bb ?? '—'}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--text-1)', ...heat(r.so, soPool, 'lo') }}>{r.so ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p style={{ fontSize: 8, color: 'var(--text-4)', marginTop: 3 }}>
              L5/L10 = last N games actually played this season (MLB gameLog) · vs {pitcherHand}HP = season-to-date vs this pitcher's throwing hand
            </p>
          </div>
          )
        })()}

        {/* Bat tracking — same StatTile grid as Pitcher Report's own
            PlayerStatcastDetail, heat-mapped against tonight's full pool
            (both lineups) instead of a plain table. */}
        {!noBatSplits && (() => {
          const g = (k: keyof BatterRow) => pool.map(p => p[k] as number | null)
          return (
          <div style={{ minWidth: 320 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
              BAT TRACKING <span style={{ fontWeight: 400, textTransform: 'none' }}>· heat-mapped vs tonight's lineups</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
              <StatTile label="BSPD" value={f1(row.s_spd)} title="Season bat speed" heatStyle={heat(row.s_spd, g('s_spd'), 'hi')} />
              <StatTile label="R·SPD" value={f1(row.r_spd)} title="Recent bat speed" heatStyle={heat(row.r_spd, g('r_spd'), 'hi')} />
              <StatTile label="ΔSPD" value={dlt(row.d_spd)} title="Recent − season bat speed" heatStyle={heat(row.d_spd, g('d_spd'), 'hi')} />
              <StatTile label="HARDSW" value={row.s_hrd != null ? `${(row.s_hrd * 100).toFixed(1)}%` : '—'} title="Hard swing rate" heatStyle={heat(row.s_hrd, g('s_hrd'), 'hi')} />
              <StatTile label="SQ" value={row.s_sq != null ? `${(row.s_sq * 100).toFixed(1)}%` : '—'} title="Squared-up per swing" heatStyle={heat(row.s_sq, g('s_sq'), 'hi')} />
              <StatTile label="R·SQ" value={row.r_sq != null ? `${(row.r_sq * 100).toFixed(1)}%` : '—'} title="Recent squared-up" heatStyle={heat(row.r_sq, g('r_sq'), 'hi')} />
              <StatTile label="ΔSQ" value={dlt(row.d_sq, 100)} title="Squared-up delta ×100" heatStyle={heat(row.d_sq, g('d_sq'), 'hi')} />
              <StatTile label="BLAST" value={row.s_bla != null ? `${(row.s_bla * 100).toFixed(1)}%` : '—'} title="Blast per swing" heatStyle={heat(row.s_bla, g('s_bla'), 'hi')} />
              <StatTile label="R·BLA" value={row.r_bla != null ? `${(row.r_bla * 100).toFixed(1)}%` : '—'} title="Recent blast per swing" heatStyle={heat(row.r_bla, g('r_bla'), 'hi')} />
              <StatTile label="SWLEN" value={f1(row.s_len)} title="Swing length" heatStyle={heat(row.s_len, g('s_len'), 'lo')} />
              <StatTile label="ATK°" value={f1(row.s_atk)} title="Attack angle" heatStyle={heat(row.s_atk, g('s_atk'), 'hi')} />
              <StatTile label="R·ATK" value={f1(row.r_atk)} title="Recent attack angle" heatStyle={heat(row.r_atk, g('r_atk'), 'hi')} />
              <StatTile label="IDLAA" value={row.s_iaa != null ? `${(row.s_iaa * 100).toFixed(1)}%` : '—'} title="Ideal attack angle rate" heatStyle={heat(row.s_iaa, g('s_iaa'), 'hi')} />
              <StatTile label="TILT" value={f1(row.s_tlt)} title="Swing tilt" />
            </div>
            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 5 }}>BATTED BALL</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <StatTile label="BRL%" value={ppRaw(row.s_brl)} title="Barrel batted rate" heatStyle={heat(row.s_brl, g('s_brl'), 'hi')} />
              <StatTile label="HH%" value={ppRaw(row.s_hh)} title="Hard hit rate" heatStyle={heat(row.s_hh, g('s_hh'), 'hi')} />
              <StatTile label="PULLAIR" value={row.s_pa != null ? `${(row.s_pa * 100).toFixed(1)}%` : '—'} title="Pull air rate" heatStyle={heat(row.s_pa, g('s_pa'), 'hi')} />
              <StatTile label="FB%" value={row.s_fb != null ? `${(row.s_fb * 100).toFixed(1)}%` : '—'} title="Flyball rate" heatStyle={heat(row.s_fb, g('s_fb'), 'hi')} />
              <StatTile label="EV" value={f1(row.s_ev)} title="Exit velocity" heatStyle={heat(row.s_ev, g('s_ev'), 'hi')} />
              <StatTile label="LA" value={f1(row.s_la)} title="Launch angle" />
              <StatTile label="XHR" value={f1(row.s_xhr)} title="Expected HR (season)" heatStyle={heat(row.s_xhr, g('s_xhr'), 'hi')} />
              <StatTile label="HR" value={row.s_hr != null ? String(Math.round(row.s_hr)) : '—'} title="Season HR total" heatStyle={heat(row.s_hr, g('s_hr'), 'hi')} />
            </div>
          </div>
          )
        })()}
      </div>

      {/* Full pitcher matchup card — literally Pitcher Report's own
          PitchMixTable/BatterVsPitchTable, scoped to just this one batter
          vs the pitcher he's actually facing tonight, not a condensed
          rebuild. Reuses the same windowMode/liveN toggle above. */}
      {pitcherRow && lineupPlayer && oppPitcher && (
        <div style={{ width: '100%', marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <PlayerAvatar mlbId={oppPitcher.id ?? null} size={40} teamAbbr={pitcherTeamAbbr} name={oppPitcher.name} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-1)' }}>
                {oppPitcher.name} <span style={{ color: 'var(--accent)' }}>{pitcherHand}HP</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {pitcherTeamName} · facing {lineupPlayer.team_name || row.team} · {lineupConfirmed ? 'Confirmed lineup' : 'Projected lineup (roster, not confirmed batting order)'}
              </div>
            </div>
          </div>

          <PitchMixTable
            title={`${oppPitcher.name}'s mix vs ${effectiveBats === 'L' ? 'LHB' : 'RHB'} (${row.name})`}
            rows={matchupMixRows}
            hand={effectiveBats as 'R' | 'L'}
            pinned={matchupPinned}
            onTogglePin={onToggleMatchupPin}
          />

          {matchupMixRows.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-1)', marginBottom: 4 }}>
                {matchupPinned.size > 0 ? '📌 Pinned pitches' : `${row.name}'s recent form vs these pitches`}
              </div>
              {matchupShownTypes.length === 0 ? (
                <div style={{ padding: 12, color: 'var(--text-3)', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  No pitch cleared the 10-pitch auto-pick threshold yet — click any row in the table above to pin it.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {matchupShownTypes.map(pitchType => {
                    const mixRow = matchupMixRows.find((r: any) => r.pitch_type === pitchType)
                    return (
                      <div key={pitchType}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: pitchColor(pitchType) }} />
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-1)' }}>{pitchLabel(pitchType)}</span>
                          {mixRow && (
                            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                              ({matchupPct(mixRow.hard_hit_pct)} hard-hit · {matchupPct(mixRow.barrel_pct)} barrel · {mixRow.pitches} pitches)
                            </span>
                          )}
                        </div>
                        <BatterVsPitchTable
                          pitchType={pitchType}
                          batters={[lineupPlayer]}
                          date={gameInfo.game_date ?? ''}
                          pitcherId={oppPitcher.id}
                          pitcherHand={pitcherHand}
                          splitMap={splitMap}
                          timingMap={timingMap}
                          pitcherMap={pitcherMap}
                          pikkitMap={pikkitMap}
                          getRow={matchupGetRow(pitchType)}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </td>
  )
}

// ─── watchlist-able odds cell ─────────────────────────────────────────────────
function OddsCell({
  row, gameInfo, propKey, book, odds, style, display, badge, openOdds,
}: {
  row: BatterRow
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  propKey: string
  book: string
  odds: number | null
  style: React.CSSProperties
  display?: React.ReactNode
  badge?: { label: string; color: string; title: string }
  // Opening/early price for this same market — when present and different
  // from the current price, shows a small delta arrow + tooltip. Sourced
  // from the admin gap importers' "opening" checkbox (manual paste, since
  // these markets have no automated feed to snapshot automatically).
  openOdds?: number | null
}) {
  const wl = useWatchlist()
  const [busy, setBusy] = useState(false)
  if (odds == null) return <td style={style}>—</td>

  const meta = PROP_META[propKey]
  const saved = wl.isSaved(row.mlb_id, propKey, book)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (saved || busy || !wl.signedIn) return
    setBusy(true)
    try {
      const oddsByBook = (row.rawProps?.[propKey] as Record<string, number>) || { [book]: odds }
      await wl.add({
        sport: gameInfo.sport,
        game_pk: gameInfo.game_pk,
        game_date: gameInfo.game_date,
        mlb_id: row.mlb_id,
        player_name: row.name,
        team: row.team,
        position: row.position,
        bats: row.bats,
        headshot_url: row.mlb_id ? mlbHeadshot(row.mlb_id) : null,
        prop_key: propKey,
        prop_label: meta?.label ?? propKey,
        book,
        odds,
        odds_by_book: oddsByBook,
      })
    } finally {
      setBusy(false)
    }
  }

  const hasDelta = openOdds != null && openOdds !== odds
  const deltaTitle = hasDelta ? `Opened ${oStr(openOdds)} → now ${oStr(odds)}` : null
  const title = [
    wl.signedIn ? (saved ? 'Saved to watchlist' : `Click to add ${meta?.label ?? propKey} @ ${book} to watchlist`) : null,
    deltaTitle,
  ].filter(Boolean).join(' · ') || undefined

  const cellContent = (
    <>
      {badge && (
        <Tooltip content={badge.title}>
          <div style={{ fontSize: 6.5, fontWeight: 900, color: badge.color, letterSpacing: '0.03em', lineHeight: 1, marginBottom: 1, cursor: 'help' }}>
            {badge.label}
          </div>
        </Tooltip>
      )}
      {display ?? oStr(odds)}
      {hasDelta && (
        <span style={{ marginLeft: 2, fontSize: 8, color: odds! < openOdds! ? '#4ade80' : '#f87171' }}>
          {odds! < openOdds! ? '▼' : '▲'}
        </span>
      )}
      {saved && <span style={{ position: 'absolute', top: 1, right: 1, fontSize: 6 }}>★</span>}
    </>
  )

  return (
    <td
      onClick={handleClick}
      style={{
        ...style,
        cursor: wl.signedIn ? 'pointer' : style.cursor,
        position: 'relative',
        color: saved ? 'var(--accent)' : style.color,
        fontWeight: saved ? 700 : style.fontWeight,
      }}
    >
      {title ? (
        <Tooltip content={title} containerClassName="w-full h-full flex items-center justify-center">
          {cellContent}
        </Tooltip>
      ) : cellContent}
    </td>
  )
}

// ─── batter row ───────────────────────────────────────────────────────────────
function BatterRowEl({ row, pool, expanded, onToggle, gameInfo, onShowHr, id }: {
  row: BatterRow; pool: BatterRow[]; expanded: boolean; onToggle: () => void
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  onShowHr?: () => void
  id?: string
}) {
  const g = (f: keyof BatterRow) => pool.map(r => r[f] as number | null)
  const hits = row.hr_hits ?? []
  const hasFirst = hits.some(h => h.is_first_hr_of_game)
  const hasHr = hits.length > 0

  // Hand badge — always visible at a glance, not buried a click away in the
  // drilldown. Colors are just a fixed convention (L/R/S), not heat-mapped.
  const handColor = row.bats === 'L' ? '#60a5fa' : row.bats === 'S' ? '#c084fc' : '#fb923c'
  // "Live matchup" flag — real signal, not decoration: only lights up when
  // matchup_edge actually has enough recent sample on both sides to exist at
  // all (computeMatchupEdge returns null otherwise) AND sits meaningfully
  // above the pool's own average tonight, i.e. this guy's edge is genuinely
  // better than his teammates'/opponents' right now, not just non-null.
  const edgePool = g('matchup_edge').filter((x): x is number => x != null)
  const edgeAvg = edgePool.length ? edgePool.reduce((a, b) => a + b, 0) / edgePool.length : 0
  const hasLiveMatchup = row.matchup_edge != null && row.matchup_edge > edgeAvg + 8

  // Collapsed into a single chip (see below) so an arbitrary number of active
  // signals never grows wider than one badge — ordered most-concrete-first
  // (an HR that already happened beats a predictive matchup edge).
  const badgeSignals: { icon: string; label: string; detail: string; color: string; bg: string; border: string; clickable: boolean }[] = []
  if (hasFirst) {
    badgeSignals.push({
      icon: '🥇', label: 'FHR', clickable: true,
      color: '#fde047', bg: 'rgba(253,224,71,0.15)', border: 'rgba(253,224,71,0.3)',
      detail: `First HR of the game${hits.length > 1 ? ` (${hits.length} HRs today)` : ''} — click for details`,
    })
  }
  if (hasHr && (hits.length > 1 || !hasFirst)) {
    badgeSignals.push({
      icon: '🔥', label: hits.length > 1 ? `${hits.length}HR` : 'HR', clickable: true,
      color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)',
      detail: `${hits.length} home run${hits.length > 1 ? 's' : ''} today — click for details`,
    })
  }
  // ⚡EDGE and 💰HR÷RBI live as their own bare-icon badges next to the name
  // (not folded into the collapsed chip below) — icon-only so both fit
  // side by side without eating into the name's guaranteed width.
  if (!hasHr && row.near_hr) {
    badgeSignals.push({
      icon: '🎯', label: String(row.near_hr.parks_hr_count), clickable: true,
      color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)',
      detail: `Near-miss: ${row.near_hr.exit_velocity ?? '?'}mph / ${row.near_hr.hit_distance ?? '?'}ft — click for details`,
    })
  }

  return (
    <tr id={id} style={hasHr ? { background: 'rgba(74,222,128,0.05)' } : undefined}>
      {/* sticky player cell — narrower on mobile (140px vs 190px) so more of
          the ~60 scrollable stat columns are visible without scrolling past
          a name column that's eating half a 375px viewport. Width/min/max
          moved out of inline style into the className since inline styles
          always beat responsive Tailwind classes for the same property. */}
      <td
        onClick={onToggle}
        className="w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]"
        style={{ ...STD, position: 'sticky', left: 0, zIndex: 2, background: expanded ? 'rgba(180,255,77,0.06)' : hasHr ? 'rgba(74,222,128,0.08)' : 'var(--bg)', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, padding: '4px 4px' }}>
          <span style={{ fontSize: 9, color: 'var(--text-3)', width: 10, textAlign: 'right', flexShrink: 0, marginTop: 2 }}>{row.batting_order}</span>
          <Tooltip content={row.bats === 'S' ? 'Switch hitter' : row.bats === 'L' ? 'Bats left' : 'Bats right'}>
            <span
              style={{
                flexShrink: 0, width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, cursor: 'help',
                color: handColor, border: `1px solid ${handColor}`, background: `${handColor}18`,
              }}
            >{row.bats || '?'}</span>
          </Tooltip>
          <PlayerAvatar mlbId={row.mlb_id} size={24} teamAbbr={row.team} name={row.name} />
          <div style={{ overflow: 'hidden', minWidth: 0, flex: 1 }}>
            {/* Badges used to each render as their own flexShrink:0 chip on
                this same line, so 2+ active signals could squeeze the name
                down to almost nothing (e.g. "E."). They're now collapsed
                into a single capped-width chip (worst case "+N" more,
                full detail in the tooltip) so the name always keeps a
                guaranteed minimum of readable width. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: expanded ? 'var(--accent)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 32 }}>
                {row.name}
              </span>
              {badgeSignals.length > 0 && (
                <Tooltip content={badgeSignals.map(s => s.detail).join(' · ')}>
                  <span
                    onClick={badgeSignals[0].clickable ? (e) => { e.stopPropagation(); onShowHr?.() } : undefined}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 8, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap',
                      color: badgeSignals[0].color, background: badgeSignals[0].bg, border: `1px solid ${badgeSignals[0].border}`,
                      padding: '1px 4px', borderRadius: 4, cursor: badgeSignals[0].clickable ? 'pointer' : 'help',
                    }}
                  >{badgeSignals[0].icon} {badgeSignals[0].label}{badgeSignals.length > 1 ? ` +${badgeSignals.length - 1}` : ''}</span>
                </Tooltip>
              )}
              {hasLiveMatchup && (
                <Tooltip content="Live matchup edge — recently hitting the exact pitch(es) this pitcher throws hard, and this pitcher's been getting hit hard on that same pitch lately too">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', fontSize: 10, flexShrink: 0,
                    color: '#4ade80', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)',
                    padding: '1px 4px', borderRadius: 4, cursor: 'help',
                  }}>⚡</span>
                </Tooltip>
              )}
              {row.is_money_sa_rbi && (
                <Tooltip content="Value flag — this player's HR price looks cheap relative to his RBI price, with low community attention so far">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', fontSize: 10, flexShrink: 0,
                    color: '#f59e0b', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                    padding: '1px 4px', borderRadius: 4, cursor: 'help',
                  }}>💰</span>
                </Tooltip>
              )}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{row.position} · {row.bats}HB</div>
          </div>
          <span style={{ fontSize: 8, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </td>

      {/* pk */}
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.pk?.picks != null ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, fontWeight: row.pk?.picks != null ? 700 : 400 }}>
        {row.pk?.picks != null ? (
          <Tooltip content={`${row.pk.picks.toLocaleString()} community HR picks`} containerClassName="w-full h-full flex items-center justify-center">
            <span style={{ cursor: 'help' }}>{row.pk.picks >= 1000 ? `${(row.pk.picks / 1000).toFixed(1)}k` : row.pk.picks}</span>
          </Tooltip>
        ) : '—'}
      </td>

      <td style={SDIV_D} />

      {/* FHR */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="fanduel" odds={row.fhr_fd} openOdds={row.fhr_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_fd, g('fhr_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="caesars" odds={row.fhr_cz} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_cz, g('fhr_fd')) }} />
      <td style={{ ...STD, width: 36, minWidth: 36, color: row.div != null ? (row.div > 0.008 ? '#4ade80' : row.div < -0.008 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {row.div != null ? (row.div >= 0 ? '+' : '') + (row.div * 100).toFixed(1) : '—'}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.fhr_div_sa, g('fhr_div_sa')) }}>{f2(row.fhr_div_sa)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, color: 'var(--text-2)' }}>{row.fhr_pct != null ? `${(row.fhr_pct * 100).toFixed(1)}%` : '—'}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, color: 'var(--text-2)' }}>{row.sa_pct  != null ? `${(row.sa_pct  * 100).toFixed(1)}%` : '—'}</td>

      <td style={SDIV_D} />

      {/* SA */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="fanduel" odds={row.sa_fd} openOdds={row.saFd_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_fd, g('sa_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="caesars" odds={row.sa_cz} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_cz, g('sa_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="betmgm" odds={row.sa_mgm} openOdds={row.saMgm_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_mgm, g('sa_fd')) }} />
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.m_div_f, g('m_div_f')) }}>{f2(row.m_div_f)}</td>
      <OddsCell row={row} gameInfo={gameInfo} propKey="hrMl" book="fanduel" odds={row.hrMl_fd} openOdds={row.hrMl_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hrMl_fd, g('hrMl_fd')) }} />
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.sa_div_ml, g('sa_div_ml')) }}>{f2(row.sa_div_ml)}</td>
      <OddsCell row={row} gameInfo={gameInfo} propKey="laser105" book="fanduel" odds={row.laser105_fd} openOdds={row.laser105_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.laser105_fd, g('laser105_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="moonshot" book="fanduel" odds={row.moonshot_fd} openOdds={row.moonshot_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.moonshot_fd, g('moonshot_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="pa1" book="fanduel" odds={row.pa1_fd} openOdds={row.pa1_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.pa1_fd, g('pa1_fd')) }} />
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.pa1_div_sa, g('pa1_div_sa')) }}>{f2(row.pa1_div_sa)}</td>
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="rbi" book="fanduel" odds={row.rbi_fd} openOdds={row.rbiFd_open} display={f2(row.sa_div_rbi)}
        style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_rbi, g('sa_div_rbi')) }}
      />
      <OddsCell row={row} gameInfo={gameInfo} propKey="rbi2" book="fanduel" odds={row.rbi2_fd} openOdds={row.rbi2Fd_open} display={f2(row.sa_div_rbi2)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_rbi2, g('sa_div_rbi2')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="rbi3" book="fanduel" odds={row.rbi3_fd} openOdds={row.rbi3Fd_open} display={f2(row.sa_div_rbi3)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_rbi3, g('sa_div_rbi3')) }} />
      {/* No openOdds here on purpose: BDL's own HRR line is variable-threshold
          per player (hrr_line in balldontlie.ts) — our opening capture is
          always the exact "1+" section, so BDL's current could silently be a
          2+/3+ line for a different player. Showing a delta would compare
          two different markets as if they were the same one. */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="hrr" book="fanduel" odds={row.hrr_fd} display={f2(row.sa_div_hrr)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_hrr, g('sa_div_hrr')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="tb4" book="fanduel" odds={row.tb4_fd} openOdds={row.tb4Fd_open} display={f2(row.sa_div_tb4)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_tb4, g('sa_div_tb4')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="tb5" book="fanduel" odds={row.tb5_fd} openOdds={row.tb5Fd_open} display={f2(row.sa_div_tb5)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_tb5, g('sa_div_tb5')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="hr2" book="fanduel" odds={row.hr2_fd} openOdds={row.hr2Fd_open} display={f2(row.sa_div_hr2)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_hr2, g('sa_div_hr2')) }} />

      <td style={SDIV_D} />

      {/* Props — "POWER VEHICLE" gate (ported from mlb-party Signals): stuffed
          single + expensive double, both priced consistent with real HR/TB
          conviction, gets an amber ⚡PWR badge + border across SNG/DBL/TRI. */}
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="singles" book="fanduel" odds={row.sng_fd} openOdds={row.sngFd_open}
        style={{
          ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sng_fd, g('sng_fd')),
          ...(row.is_pwr ? { borderTop: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b', borderLeft: '2px solid #f59e0b', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.25)' } : {}),
        }}
        badge={row.is_pwr ? { label: '⚡PWR', color: '#f59e0b', title: 'Power Vehicle — this player\'s HR, double, and total-bases pricing all line up with real book conviction on power tonight' } : undefined}
      />
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="doubles" book="fanduel" odds={row.dbl_fd} openOdds={row.dblFd_open}
        style={{
          ...STD, width: 50, minWidth: 50, ...oddsHeat(row.dbl_fd, g('dbl_fd')),
          ...(row.is_pwr ? { borderTop: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b' } : {}),
        }}
      />
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="triples" book="fanduel" odds={row.tri_fd} openOdds={row.triFd_open}
        style={{
          ...STD, width: 50, minWidth: 50, ...oddsHeat(row.tri_fd, g('tri_fd')),
          ...(row.is_pwr ? { borderTop: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b', borderRight: '2px solid #f59e0b', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.25)' } : {}),
        }}
      />
      <td style={{ ...STD, width: 40, minWidth: 40, ...heat(row.sa_div_c1, g('sa_div_c1')) }}>
        {row.combo1_partners ? (
          <Tooltip content={`Cheapest of ${row.combo1_count} pairing(s): ${(row.combo1_partners as any[]).slice().sort((a, b) => a.price - b.price).slice(0, 3).map(p => `${p.partner} (${p.price >= 0 ? '+' : ''}${p.price})`).join(', ')}`} containerClassName="w-full h-full flex items-center justify-center">
            <span style={{ cursor: 'help' }}>{f2(row.sa_div_c1)}</span>
          </Tooltip>
        ) : f2(row.sa_div_c1)}
      </td>
      <td style={{ ...STD, width: 40, minWidth: 40, ...heat(row.sa_div_c2, g('sa_div_c2')) }}>
        {row.combo2_partners ? (
          <Tooltip content={`Cheapest of ${row.combo2_count} pairing(s): ${(row.combo2_partners as any[]).slice().sort((a, b) => a.price - b.price).slice(0, 3).map(p => `${p.partner} (${p.price >= 0 ? '+' : ''}${p.price})`).join(', ')}`} containerClassName="w-full h-full flex items-center justify-center">
            <span style={{ cursor: 'help' }}>{f2(row.sa_div_c2)}</span>
          </Tooltip>
        ) : f2(row.sa_div_c2)}
      </td>

      <td style={SDIV_D} />

      {/* Paper & ranks */}
      <td style={{ ...STD, width: 46, minWidth: 46, fontWeight: 700, ...heat(row.paper, g('paper')) }}>
        {row.paper != null ? row.paper.toFixed(3) : '—'}
      </td>
      <td style={{ ...STD, width: 30, minWidth: 30, color: (row.bk_rk ?? 99) <= 3 ? 'var(--accent)' : 'var(--text-1)' }}>{row.bk_rk ?? '—'}</td>
      <td style={{ ...STD, width: 30, minWidth: 30, color: (row.pp_rk ?? 99) <= 3 ? 'var(--accent)' : 'var(--text-1)' }}>{row.pp_rk ?? '—'}</td>
      <td style={{ ...STD, width: 30, minWidth: 30, fontWeight: 700, color: row.mm != null ? (row.mm > 3 ? '#4ade80' : row.mm < -3 ? '#f87171' : 'var(--text-1)') : 'var(--text-3)' }}>
        {row.mm != null ? (row.mm > 0 ? '+' : '') + row.mm : '—'}
      </td>

      <td style={SDIV_D} />

      {/* Bat tracking */}
      <td style={{ ...STD, width: 38, minWidth: 38, ...heat(row.s_spd, g('s_spd')) }}>{f1(row.s_spd)}</td>
      <td style={{ ...STD, width: 38, minWidth: 38, ...heat(row.r_spd, g('r_spd')) }}>{f1(row.r_spd)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_spd != null ? (row.d_spd > 0.5 ? '#4ade80' : row.d_spd < -0.5 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_spd)}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_timing, g('s_timing')) }}>{pp(row.s_timing)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_timing, g('r_timing')) }}>{pp(row.r_timing)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_miss, g('s_miss'), 'lo') }}>{f1(row.s_miss)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_miss, g('r_miss'), 'lo') }}>{f1(row.r_miss)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_hrd, g('s_hrd')) }}>{pp(row.s_hrd)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_sq,  g('s_sq'))  }}>{pp(row.s_sq)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_sq,  g('r_sq'))  }}>{pp(row.r_sq)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_sq != null ? (row.d_sq > 0.01 ? '#4ade80' : row.d_sq < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_sq, 100)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_bla, g('s_bla')) }}>{pp(row.s_bla)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_bla, g('r_bla')) }}>{pp(row.r_bla)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_len, g('s_len'), 'lo') }}>{f1(row.s_len)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_atk, g('s_atk')) }}>{f1(row.s_atk)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_atk, g('r_atk')) }}>{f1(row.r_atk)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_iaa, g('s_iaa')) }}>{pp(row.s_iaa)}</td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.s_tlt)}</td>

      <td style={SDIV_D} />

      {/* Batted ball */}
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_brl, g('s_brl')) }}>{ppRaw(row.s_brl)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_hh,  g('s_hh'))  }}>{ppRaw(row.s_hh)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_pa,  g('s_pa'))  }}>{pp(row.s_pa)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_fb,  g('s_fb'))  }}>{pp(row.s_fb)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_ev,  g('s_ev'))  }}>{f1(row.s_ev)}</td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.s_la)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_xhr, g('s_xhr')) }}>{f1(row.s_xhr)}</td>
      <td style={{ ...STD, width: 30, minWidth: 30, ...heat(row.s_hr,  g('s_hr'))  }}>
        {row.s_hr != null ? String(Math.round(row.s_hr)) : '—'}
      </td>
    </tr>
  )
}

// ─── HR / near-HR popup ─────────────────────────────────────────────────────
function HrEventCard({ hit, ordinal, total }: { hit: any; ordinal: number; total: number }) {
  const ev = hit.exit_velocity
  const dist = hit.hit_distance
  const la = hit.launch_angle
  const isLaser110 = ev != null && ev >= 110
  const isLaser105 = ev != null && ev >= 105
  const isMoonshot = dist != null && dist >= 420

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: total > 1 ? 10 : 0 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: hit.is_first_hr_of_game ? '#fde047' : '#4ade80', background: hit.is_first_hr_of_game ? 'rgba(253,224,71,0.15)' : 'rgba(74,222,128,0.12)', padding: '3px 8px', borderRadius: 5 }}>
          🔥 {hit.is_first_hr_of_game ? 'FIRST HR OF GAME' : total > 1 ? `HR #${ordinal}` : 'HOME RUN'}
        </span>
        {isLaser110 && <span style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,0.12)', padding: '3px 8px', borderRadius: 5 }}>⚡ LASER 110+</span>}
        {!isLaser110 && isLaser105 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', background: 'rgba(251,146,60,0.12)', padding: '3px 8px', borderRadius: 5 }}>⚡ LASER 105+</span>}
        {isMoonshot && <span style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '3px 8px', borderRadius: 5 }}>🌙 MOONSHOT</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exit Velo</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{ev != null ? `${ev} mph` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Distance</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{dist != null ? `${dist} ft` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Launch Angle</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{la != null ? `${la}°` : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inning</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{hit.half === 'top' ? '▲' : '▼'}{hit.inning}</div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Pitcher</div>
        <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{hit.pitcher_name || '—'}</div>
      </div>

      {hit.desc && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>{hit.desc}</div>
      )}
    </div>
  )
}

function HrPopup({ row, onClose }: { row: BatterRow; onClose: () => void }) {
  const hits = row.hr_hits ?? []
  const near = row.near_hr
  const hasHr = hits.length > 0

  // Near-miss fallback (no confirmed HR yet)
  const nEv = near?.exit_velocity, nDist = near?.hit_distance
  const nLaser110 = nEv != null && nEv >= 110
  const nLaser105 = nEv != null && nEv >= 105
  const nMoon = nDist != null && nDist >= 420

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: hasHr ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', backdropFilter: 'blur(8px)' }}>
          <PlayerAvatar mlbId={row.mlb_id} size={36} teamAbbr={row.team} name={row.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{row.name}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {row.team} · {row.position}{hasHr && hits.length > 1 ? ` · ${hits.length} HRs today` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        <div style={{ padding: 16 }}>
          {hasHr && hits.map((hit, i) => (
            <HrEventCard key={i} hit={hit} ordinal={i + 1} total={hits.length} />
          ))}

          {!hasHr && near && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', padding: '3px 8px', borderRadius: 5 }}>
                  🎯 NEAR MISS — would've left {near.parks_hr_count} park{near.parks_hr_count === 1 ? '' : 's'}
                </span>
                {nLaser110 && <span style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,0.12)', padding: '3px 8px', borderRadius: 5 }}>⚡ LASER 110+</span>}
                {!nLaser110 && nLaser105 && <span style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', background: 'rgba(251,146,60,0.12)', padding: '3px 8px', borderRadius: 5 }}>⚡ LASER 105+</span>}
                {nMoon && <span style={{ fontSize: 10, fontWeight: 800, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', padding: '3px 8px', borderRadius: 5 }}>🌙 MOONSHOT</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Exit Velo</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{nEv != null ? `${nEv} mph` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Distance</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{nDist != null ? `${nDist} ft` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Launch Angle</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{near.launch_angle != null ? `${near.launch_angle}°` : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Inning</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>{near.half_inning === 'top' ? '▲' : '▼'}{near.inning}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <div style={{ fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Pitcher</div>
                <div style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 600 }}>{near.pitcher_name || '—'}</div>
                {near.pitch_type && (
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{near.pitch_type}{near.pitch_speed != null ? ` · ${near.pitch_speed} mph` : ''}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── today's HR leaderboard ─────────────────────────────────────────────────
// hrFeed already carries every live/final HR of the slate (see fetchHrFeed in
// dugout/data/route.ts) but was only ever surfaced per-player-row within
// whichever game you happened to have open — there was no single place to
// see "who's already gone deep today" across the whole board at a glance.
function HrLeaderboard({ hits, teamByMlbId, onJumpToGame, onClose }: {
  hits: any[]
  teamByMlbId: Record<number, { team: string; gameKey: string }>
  onJumpToGame: (gameKey: string) => void
  onClose: () => void
}) {
  const [sortBy, setSortBy] = useState<'ev' | 'dist' | 'time'>('ev')

  const sorted = useMemo(() => {
    const withMeta = hits.map(h => ({ ...h, _team: teamByMlbId[h.mlb_id]?.team ?? null, _gameKey: teamByMlbId[h.mlb_id]?.gameKey ?? null }))
    return [...withMeta].sort((a, b) => {
      if (sortBy === 'ev') return (b.exit_velocity ?? -1) - (a.exit_velocity ?? -1)
      if (sortBy === 'dist') return (b.hit_distance ?? -1) - (a.hit_distance ?? -1)
      return (a.game_pk ?? 0) - (b.game_pk ?? 0) || (a.ab_index ?? 0) - (b.ab_index ?? 0)
    })
  }, [hits, teamByMlbId, sortBy])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: 'rgba(74,222,128,0.1)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Today's Home Runs</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{hits.length} HR{hits.length === 1 ? '' : 's'} across the slate so far</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          {([['ev', 'Exit Velo'], ['dist', 'Distance'], ['time', 'Time']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: sortBy === key ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: sortBy === key ? 'var(--accent-dim)' : 'transparent',
              color: sortBy === key ? 'var(--accent)' : 'var(--text-3)',
            }}>{label}</button>
          ))}
        </div>

        <div style={{ overflowY: 'auto', padding: 12 }}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 12 }}>No home runs yet today.</div>
          ) : sorted.map((h, i) => {
            const ev = h.exit_velocity, dist = h.hit_distance
            const isLaser110 = ev != null && ev >= 110
            const isLaser105 = !isLaser110 && ev != null && ev >= 105
            const isMoonshot = dist != null && dist >= 420
            return (
              <div key={`${h.mlb_id}-${h.ab_index}-${i}`}
                onClick={() => h._gameKey && onJumpToGame(h._gameKey)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: h._gameKey ? 'pointer' : 'default', marginBottom: 4 }}
                onMouseEnter={e => h._gameKey && ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                <PlayerAvatar mlbId={h.mlb_id} size={32} teamAbbr={h._team} name={h.player_name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{h.player_name}</span>
                    {h.is_first_hr_of_game && <span style={{ fontSize: 9, fontWeight: 800, color: '#fde047' }}>1ST</span>}
                    {isLaser110 && <span style={{ fontSize: 9, fontWeight: 800, color: '#f87171' }}>⚡110+</span>}
                    {isLaser105 && <span style={{ fontSize: 9, fontWeight: 800, color: '#fb923c' }}>⚡105+</span>}
                    {isMoonshot && <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa' }}>🌙</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                    {h._team ?? ''} · off {h.pitcher_name || '—'} · {h.half === 'top' ? '▲' : '▼'}{h.inning}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{ev != null ? `${ev} mph` : '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{dist != null ? `${dist} ft` : '—'}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// 'pk' isn't a plain number on the row — it's the whole pikkit object
// ({picks, prop_type, ...}), so the generic a[col] extraction below would
// diff two objects (always NaN) and silently never reorder anything.
function sortValue(r: BatterRow, col: string): number | null {
  if (col === 'pk') return (r.pk as any)?.picks ?? null
  return r[col as keyof BatterRow] as unknown as number | null
}

function sortRows(rows: BatterRow[], sort: SortState): BatterRow[] {
  if (!sort) return rows
  return [...rows].sort((a, b) => {
    const av = sortValue(a, sort.col)
    const bv = sortValue(b, sort.col)
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return sort.dir === 'desc' ? bv - av : av - bv
  })
}

// The opposing-pitcher label at the top of each lineup used to be plain
// gray text ("vs RHP Robert Gasser") — no headshot, no way to tell hand at
// a glance, and no way to actually get to that pitcher's own page. Links
// straight into Pitcher Report with this exact pitcher pre-selected, same
// full-site-fluidity pattern as the batter links elsewhere in this file
// that jump the other direction (Pitcher Report -> Dugout via ?highlight=).
function PitcherLinkChip({ pitcher, teamAbbr, date }: { pitcher: { id: number; name: string; hand: string }; teamAbbr: string; date: string }) {
  return (
    <Tooltip content={`Open ${pitcher.name} in Pitcher Report`}>
      <Link
        href={`/pitcher-report?date=${date}&pitcherId=${pitcher.id}`}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', textDecoration: 'none' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'underline' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.textDecoration = 'none' }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>vs</span>
        <SharedPlayerAvatar headshot={mlbHeadshot(pitcher.id)} teamLogo={getTeamLogoUrl(teamAbbr)} teamAbbr={teamAbbr} name={pitcher.name} size={22} />
        {/* Same L=blue/R=orange hand convention used everywhere else in
            this app (batter-hand badges, Pitcher Report's starter cards). */}
        <span style={{ fontSize: 10, fontWeight: 800, color: pitcher.hand === 'L' ? '#60a5fa' : '#fb923c' }}>{pitcher.hand}HP</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)' }}>{pitcher.name}</span>
      </Link>
    </Tooltip>
  )
}

// ─── game table ───────────────────────────────────────────────────────────────
function GameTable({ game, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, gameLogMap, platoonMap, pitchEventsMap, highlightMlbId, date }: {
  game: any
  splitMap: SplitMap; timingMap: TimingMap; pitcherMap: PitcherMap
  fhrAvgMap: Record<string, { fd?: number; cz?: number }>
  saAvgMap:  Record<string, { fd?: number; cz?: number }>
  pikkitMap: Record<string, any>
  openingMap: Record<string, { sa_open: number | null; rbi_open: number | null }>
  hrMap: Record<string, any[]>
  nearMap: Record<string, any>
  batterPitchMap: BatterPitchMap
  pitcherPitchMap: PitcherPitchMap
  gameLogMap: GameLogMap
  platoonMap: PlatoonMap
  pitchEventsMap: PitchEventsMap
  highlightMlbId?: number | null
  date: string
}) {
  const [sort, setSort] = useState<SortState>(null)
  const highlightKey = highlightMlbId != null
    ? (game.homeLineup?.some((p: any) => p.mlb_id === highlightMlbId) ? `h-${highlightMlbId}` : `a-${highlightMlbId}`)
    : null
  const [expanded, setExpanded] = useState<string | null>(highlightKey)
  const [hrPopupRow, setHrPopupRow] = useState<BatterRow | null>(null)
  const toggleExpand = (key: string) => setExpanded(prev => prev === key ? null : key)

  // Pitcher Report's "Last N Starts/Games" live-computed window, surfaced
  // here too — same /api/pitcher-report/live-window endpoint, same response
  // shape (pitchLog.ts's aggregate rows use the same field names as the
  // mlb-party pitch_type_recent tables PlayerDrillDown already reads, so no
  // data-shape conversion is needed, just swapping which source the pitch-mix
  // table below pulls from). Lives at the GameTable level, not per-row, so
  // switching between two batters facing the same pitcher reuses one fetch
  // instead of refetching per row — and only one row can be expanded at a
  // time in this table anyway (single `expanded` key for both teams).
  const [windowMode, setWindowMode] = useState<'14day' | 'live'>('14day')
  const [liveN, setLiveN] = useState(3)
  const [liveCache, setLiveCache] = useState<Record<string, { status: 'loading' | 'ready' | 'error'; data?: any; error?: string }>>({})

  useEffect(() => {
    if (windowMode !== 'live' || !expanded) return
    const isHome = expanded.startsWith('h-')
    const pitcher = isHome ? game.awayPitcher : game.homePitcher
    const lineup = isHome ? game.homeLineup : game.awayLineup
    const pitcherId = pitcher?.id
    if (!pitcherId) return
    const key = `${pitcherId}-${liveN}`
    if (liveCache[key]) return
    const batterIds = (lineup ?? []).map((p: any) => p.mlb_id).filter(Boolean)
    setLiveCache(prev => ({ ...prev, [key]: { status: 'loading' } }))
    fetch(`/api/pitcher-report/live-window?pitcherId=${pitcherId}&batterIds=${batterIds.join(',')}&games=${liveN}`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || 'Failed to compute live window')
        setLiveCache(prev => ({ ...prev, [key]: { status: 'ready', data: json } }))
      })
      .catch((e: any) => {
        setLiveCache(prev => ({ ...prev, [key]: { status: 'error', error: e.message || 'Failed to load live window' } }))
      })
    // liveCache deliberately omitted — it's read for a cache-hit check, not a
    // dependency; including it would refetch every time any entry is set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowMode, liveN, expanded, game])

  useEffect(() => {
    if (!highlightKey) return
    // A short delay so the expanded drilldown row has actually rendered
    // (and pushed layout) before scrolling — scrolling immediately can
    // land short since the drilldown's height isn't in the page yet.
    const t = setTimeout(() => {
      document.getElementById('dugout-highlight-row')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 150)
    return () => clearTimeout(t)
    // Only on mount for this game/highlight combo — don't re-scroll every
    // time the row's own data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightKey])

  const toggleSort = (col: string) =>
    setSort(prev => prev?.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })

  const { homeRows, awayRows, pool } = useMemo(() => {
    const ap = game.awayPitcher
    const hp = game.homePitcher
    const homeRows = game.homeLineup.map((p: any) =>
      buildBatterRow(p, ap?.hand || 'R', ap?.id ?? null, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap)
    )
    const awayRows = game.awayLineup.map((p: any) =>
      buildBatterRow(p, hp?.hand || 'R', hp?.id ?? null, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap)
    )
    const pool = [...homeRows, ...awayRows]
    computePaper(pool)
    computeRanks(pool)
    return { homeRows, awayRows, pool }
  }, [game, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap])

  const displayHome = sortRows(homeRows, sort)
  const displayAway = sortRows(awayRows, sort)

  const gameInfo = { sport: 'MLB', game_pk: game.gamePk != null ? String(game.gamePk) : null, game_date: game.gameDate ? String(game.gameDate).slice(0, 10) : null }

  const H = (label: React.ReactNode, title?: string, w = 40, sortKey?: string) =>
    <TH label={label} title={title} w={w} sortKey={sortKey} sortState={sort} onSort={toggleSort} />

  const BL = (vendor: string, prop: string, title?: string, w = 50, sortKey?: string) =>
    <TH
      label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><BookLogo vendor={vendor} size={13} />{prop}</span>}
      title={title} w={w} sortKey={sortKey} sortState={sort} onSort={toggleSort}
    />

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8 }}>
      <table className="dugout-dense-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10, width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            <TH label="Player" title="Batting order" w={190} sticky sortKey="batting_order" sortState={sort} onSort={toggleSort} />
            {H('pk', 'Community HR pick count', 34, 'pk')}
            <th style={SDIV_H} />
            {BL('fanduel', 'FHR', 'FanDuel First HR', 50, 'fhr_fd')}
            {BL('caesars', 'FHR', 'Caesars First HR', 50, 'fhr_cz')}
            {H('div', 'FD−CZ implied diff ×100', 36, 'div')}
            {H('FHR÷HR', 'FHR implied ÷ Anytime HR implied', 36, 'fhr_div_sa')}
            {H('FHR%', 'FHR historical hit rate', 36, 'fhr_pct')}
            {H('HR%', 'Anytime HR historical rate', 36, 'sa_pct')}
            <th style={SDIV_H} />
            {BL('fanduel', 'HR', 'FanDuel Anytime HR', 50, 'sa_fd')}
            {BL('caesars', 'HR', 'Caesars Anytime HR', 50, 'sa_cz')}
            {BL('betmgm', 'HR', 'BetMGM Anytime HR', 50, 'sa_mgm')}
            {H('M÷F', 'BetMGM÷FD implied ratio', 36, 'm_div_f')}
            {H('HR/ML', 'FanDuel Home Run/Moneyline Parlay price', 44, 'hrMl_fd')}
            {H('HR÷Parlay', 'Anytime HR ÷ HR/Moneyline Parlay ratio', 36, 'sa_div_ml')}
            {H('Laser', 'Laser market price', 50, 'laser105_fd')}
            {H('Moon', 'Moonshot market price', 50, 'moonshot_fd')}
            {H('1stPA', '1st Plate Appearance HR price', 50, 'pa1_fd')}
            {H('PA÷HR', '1st Plate Appearance HR ÷ Anytime HR ratio', 36, 'pa1_div_sa')}
            {H('HR÷RBI', 'Anytime HR÷RBI implied (FD)', 38, 'sa_div_rbi')}
            {H('HR÷RBI2', 'Anytime HR÷2+RBI implied (FD)', 40, 'sa_div_rbi2')}
            {H('HR÷RBI3', 'Anytime HR÷3+RBI implied (FD)', 40, 'sa_div_rbi3')}
            {H('HR÷HRR', 'Anytime HR÷Hits+Runs+RBIs implied (FD)', 40, 'sa_div_hrr')}
            {H('HR÷TB4', 'Anytime HR÷4+ total bases implied (FD)', 40, 'sa_div_tb4')}
            {H('HR÷TB5', 'Anytime HR÷5+ total bases implied (FD)', 40, 'sa_div_tb5')}
            {H('HR÷2HR', 'Anytime HR÷2+ HR implied (FD)', 40, 'sa_div_hr2')}
            <th style={SDIV_H} />
            {BL('fanduel', 'SNG', 'Singles (FD)', 50, 'sng_fd')}
            {BL('fanduel', 'DBL', 'Doubles (FD)', 50, 'dbl_fd')}
            {BL('fanduel', 'TRI', 'Triples (FD)', 50, 'tri_fd')}
            {H('HR÷C1', 'Anytime HR ÷ cheapest "combine for HR" price', 40, 'sa_div_c1')}
            {H('HR÷C2', 'Anytime HR ÷ cheapest "combine for 2+ HR" price', 40, 'sa_div_c2')}
            <th style={SDIV_H} />
            {H('paper', 'Composite Statcast score', 46, 'paper')}
            {H('bk·rk', 'Sportsbook rank (FanDuel Anytime HR)', 30, 'bk_rk')}
            {H('pp·rk', 'Statcast rank', 30, 'pp_rk')}
            {H('mm', 'Sportsbook rank vs. Statcast rank — how far the market is from the numbers', 30, 'mm')}
            <th style={SDIV_H} />
            {H('BSpd', 'Season bat speed', 38, 's_spd')}
            {H('R·Spd', 'Recent bat speed', 38, 'r_spd')}
            {H('ΔSpd', 'Recent−season bat speed', 34, 'd_spd')}
            {H('Timing', 'Season on-time % (pitch-mix weighted)', 36, 's_timing')}
            {H('R·Timing', 'Recent timing', 36, 'r_timing')}
            {H('Miss', 'Season miss distance', 34, 's_miss')}
            {H('R·Miss', 'Recent miss distance', 34, 'r_miss')}
            {H('HardSw', 'Hard swing rate', 36, 's_hrd')}
            {H('Sq', 'Squared-up per swing', 36, 's_sq')}
            {H('R·Sq', 'Recent squared-up', 36, 'r_sq')}
            {H('ΔSq', 'Squared-up delta ×100', 34, 'd_sq')}
            {H('Blast', 'Blast per swing', 34, 's_bla')}
            {H('R·Bla', 'Recent blast per swing', 34, 'r_bla')}
            {H('SwLen', 'Swing length', 36, 's_len')}
            {H('Atk°', 'Attack angle', 34, 's_atk')}
            {H('R·Atk', 'Recent attack angle', 34, 'r_atk')}
            {H('IdlAA', 'Ideal attack angle rate', 34, 's_iaa')}
            {H('Tilt', 'Swing tilt', 32, 's_tlt')}
            <th style={SDIV_H} />
            {H('Brl%', 'Barrel batted rate', 34, 's_brl')}
            {H('HH%', 'Hard hit rate', 34, 's_hh')}
            {H('PullAir', 'Pull air rate', 36, 's_pa')}
            {H('FB%', 'Flyball rate', 34, 's_fb')}
            {H('EV', 'Exit velocity', 34, 's_ev')}
            {H('LA', 'Launch angle', 32, 's_la')}
            {H('xHR', 'Expected HR (season)', 34, 's_xhr')}
            {H('HR', 'Season HR total', 30, 's_hr')}
          </tr>
        </thead>
        <tbody>
          {/* Home */}
          <tr>
            <td colSpan={99} style={{ background: 'var(--surface)', padding: '5px 8px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamLogo abbr={game.homeAbbr} size={20} />
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-1)' }}>{game.homeTeam}</span>
                {!game.homeLineupConfirmed && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                    {game.homeLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
                  </span>
                )}
                {game.awayPitcher && <PitcherLinkChip pitcher={game.awayPitcher} teamAbbr={game.awayAbbr} date={date} />}
              </div>
            </td>
          </tr>
          {displayHome.map((row: BatterRow) => {
            const key = `h-${row.mlb_id ?? row.name}`
            const pitRow = pickPitcherRow(pitcherMap, game.awayPitcher?.id, row.bats === 'S' ? (game.awayPitcher?.hand === 'L' ? 'R' : 'L') : row.bats)
            const lineupPlayer = game.homeLineup?.find((p: any) => p.mlb_id === row.mlb_id) ?? null
            return (
              <React.Fragment key={key}>
                <BatterRowEl row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)} gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined} />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} pitcherRow={pitRow} timingMap={timingMap} oppPitcher={game.awayPitcher} gameInfo={gameInfo} batterPitchMap={batterPitchMap} pitcherPitchMap={pitcherPitchMap} gameLogMap={gameLogMap} platoonMap={platoonMap} pitchEventsMap={pitchEventsMap} windowMode={windowMode} liveN={liveN} onSetWindowMode={setWindowMode} onSetLiveN={setLiveN} liveEntry={windowMode === 'live' && game.awayPitcher?.id ? liveCache[`${game.awayPitcher.id}-${liveN}`] : undefined} lineupPlayer={lineupPlayer} pitcherTeamAbbr={game.awayAbbr} pitcherTeamName={game.awayTeam} lineupConfirmed={!!game.homeLineupConfirmed} splitMap={splitMap} pitcherMap={pitcherMap} pikkitMap={pikkitMap} pool={pool} /></tr>
                )}
              </React.Fragment>
            )
          })}

          {/* Away */}
          <tr>
            <td colSpan={99} style={{ background: 'var(--surface)', padding: '5px 8px', borderTop: '2px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamLogo abbr={game.awayAbbr} size={20} />
                <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-1)' }}>{game.awayTeam}</span>
                {!game.awayLineupConfirmed && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                    {game.awayLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
                  </span>
                )}
                {game.homePitcher && <PitcherLinkChip pitcher={game.homePitcher} teamAbbr={game.homeAbbr} date={date} />}
              </div>
            </td>
          </tr>
          {displayAway.map((row: BatterRow) => {
            const key = `a-${row.mlb_id ?? row.name}`
            const pitRow = pickPitcherRow(pitcherMap, game.homePitcher?.id, row.bats === 'S' ? (game.homePitcher?.hand === 'L' ? 'R' : 'L') : row.bats)
            const lineupPlayer = game.awayLineup?.find((p: any) => p.mlb_id === row.mlb_id) ?? null
            return (
              <React.Fragment key={key}>
                <BatterRowEl row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)} gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined} />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} pitcherRow={pitRow} timingMap={timingMap} oppPitcher={game.homePitcher} gameInfo={gameInfo} batterPitchMap={batterPitchMap} pitcherPitchMap={pitcherPitchMap} gameLogMap={gameLogMap} platoonMap={platoonMap} pitchEventsMap={pitchEventsMap} windowMode={windowMode} liveN={liveN} onSetWindowMode={setWindowMode} onSetLiveN={setLiveN} liveEntry={windowMode === 'live' && game.homePitcher?.id ? liveCache[`${game.homePitcher.id}-${liveN}`] : undefined} lineupPlayer={lineupPlayer} pitcherTeamAbbr={game.homeAbbr} pitcherTeamName={game.homeTeam} lineupConfirmed={!!game.awayLineupConfirmed} splitMap={splitMap} pitcherMap={pitcherMap} pikkitMap={pikkitMap} pool={pool} /></tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {hrPopupRow && <HrPopup row={hrPopupRow} onClose={() => setHrPopupRow(null)} />}
    </div>
  )
}

// ─── DugoutClient ─────────────────────────────────────────────────────────────
export function DugoutClient({ date }: { date: string }) {
  const [data, setData]         = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [activeGame, setActive] = useState<string | null>(null)
  const [showHrBoard, setShowHrBoard] = useState(false)

  // Deep link from elsewhere (e.g. Weather Lab's park-HR modal) — jump
  // straight to this player's row, expanded, on whichever game he's in
  // today. Read once per navigation, not on every render, since the value
  // only matters right after the data load below picks the right game.
  const searchParams = useSearchParams()
  const highlightMlbId = searchParams.get('highlight')
  const highlightId = highlightMlbId ? parseInt(highlightMlbId, 10) : null

  useEffect(() => {
    setLoading(true); setErr(null); setData(null); setActive(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        setData(d)
        // If a specific player was linked to, land on whichever game he's
        // actually in tonight instead of always the first game of the day.
        const targetGame = highlightId != null
          ? d.games?.find((g: any) =>
              g.homeLineup?.some((p: any) => p.mlb_id === highlightId) ||
              g.awayLineup?.some((p: any) => p.mlb_id === highlightId))
          : null
        setActive((targetGame ?? d.games?.[0])?.gameKey ?? null)
        setLoading(false)
      })
      .catch(e => { setErr(String(e)); setLoading(false) })
  }, [date, highlightId])

  const splitMap   = useMemo(() => buildSplitMap(data?.statSplits    ?? []), [data?.statSplits])
  const timingMap  = useMemo(() => buildTimingMap(data?.timingSplits  ?? []), [data?.timingSplits])
  const pitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])
  const batterPitchMap  = useMemo(() => buildBatterPitchMap(data?.batterPitchRecent   ?? []), [data?.batterPitchRecent])
  const pitcherPitchMap = useMemo(() => buildPitcherPitchMap(data?.pitcherPitchRecent ?? []), [data?.pitcherPitchRecent])
  const gameLogMap = useMemo(() => buildGameLogMap(data?.batterGameLogs ?? []), [data?.batterGameLogs])
  const platoonMap = useMemo(() => buildPlatoonMap(data?.batterPlatoonSplits ?? []), [data?.batterPlatoonSplits])
  const pitchEventsMap = useMemo(() => buildPitchEventsMap(data?.batterPitchEvents ?? []), [data?.batterPitchEvents])

  // get_fhr_history_avg/get_sa_history_avg return one row per (name_norm,
  // bookmaker) with the season-average AMERICAN ODDS PRICE in `avg_price` —
  // not a percentage, and not keyed "fhr_pct"/"pct". Bucket by bookmaker
  // (fanduel -> fd, williamhill_us -> cz) exactly like mlb-party's own map.
  const fhrAvgMap = useMemo<Record<string, { fd?: number; cz?: number }>>(() => {
    const m: Record<string, { fd?: number; cz?: number }> = {}
    for (const r of (data?.fhrAvg ?? [])) {
      const nn = normName(r.name_norm || r.player_name || '')
      if (!nn) continue
      if (!m[nn]) m[nn] = {}
      if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
      if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
    }
    return m
  }, [data?.fhrAvg])

  const saAvgMap = useMemo<Record<string, { fd?: number; cz?: number }>>(() => {
    const m: Record<string, { fd?: number; cz?: number }> = {}
    for (const r of (data?.saAvg ?? [])) {
      const nn = normName(r.name_norm || r.player_name || '')
      if (!nn) continue
      if (!m[nn]) m[nn] = {}
      if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
      if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
    }
    return m
  }, [data?.saAvg])

  const pikkitMap = useMemo(() => {
    // A player can have one row per market (home_runs, singles, doubles...).
    // Prefer the home_runs row specifically — that's the pick count the
    // SA÷RBI money-bag flag actually means ("field hasn't caught on to this
    // guy for the homer"), not whichever market happened to come back last.
    const m: Record<string, any> = {}
    for (const r of (data?.pikkit ?? [])) {
      const nn = normName(r.player_name || '')
      if (!nn) continue
      const isHrRow = r.prop_type === 'home_runs' || r.market === 'home_runs'
      if (!m[nn] || isHrRow) m[nn] = r
    }
    return m
  }, [data?.pikkit])

  const openingMap = useMemo<Record<string, { sa_open: number | null; rbi_open: number | null }>>(() => {
    const m: Record<string, { sa_open: number | null; rbi_open: number | null }> = {}
    for (const r of (data?.openingSaRbi ?? [])) {
      const nn = normName(r.name_norm || '')
      if (nn) m[nn] = { sa_open: r.sa_open ?? null, rbi_open: r.rbi_open ?? null }
    }
    return m
  }, [data?.openingSaRbi])

  // Live HR hits — a player can go deep more than once in a game (e.g. a
  // multi-HR day), so this keeps every hit, not just one. Sorted by at-bat
  // order so "1st homer" always renders before "2nd homer" in the popup.
  const hrMap = useMemo<Record<string, any[]>>(() => {
    const m: Record<string, any[]> = {}
    for (const h of (data?.hrFeed ?? [])) {
      const nn = normName(h.name_norm || h.player_name || '')
      if (!nn) continue
      ;(m[nn] ??= []).push(h)
    }
    for (const nn in m) m[nn].sort((a, b) => (a.ab_index ?? 0) - (b.ab_index ?? 0))
    return m
  }, [data?.hrFeed])

  // Near-miss HRs — prefer the biggest "would've left N parks" per player.
  const nearMap = useMemo<Record<string, any>>(() => {
    const m: Record<string, any> = {}
    for (const n of (data?.nearHr ?? [])) {
      const nn = normName(n.batter_name || '')
      if (!nn) continue
      if (!m[nn] || (n.parks_hr_count || 0) > (m[nn].parks_hr_count || 0)) m[nn] = n
    }
    return m
  }, [data?.nearHr])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 280, gap: 12 }}>
      <div style={{ width: 30, height: 30, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading lineups &amp; Statcast…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (err) return <div style={{ textAlign: 'center', padding: 40, color: '#ef4444', fontSize: 13 }}>Error: {err}</div>
  if (!data?.games?.length) return <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 13 }}>No games for {date}</div>

  const games: any[] = data.games
  const active = games.find(g => g.gameKey === activeGame) ?? games[0]
  const hasStats = (data.statSplits?.length ?? 0) > 0

  const teamByMlbId: Record<number, { team: string; gameKey: string }> = {}
  for (const g of games) {
    for (const p of [...(g.homeLineup ?? []), ...(g.awayLineup ?? [])]) {
      if (p.mlb_id) teamByMlbId[p.mlb_id] = { team: p.team, gameKey: g.gameKey }
    }
  }
  const hrCount = data.hrFeed?.length ?? 0

  return (
    <div>
      {!hasStats && (
        <div style={{ padding: '6px 12px', marginBottom: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#f87171' }}>
          ⚠ Statcast unavailable — mlb-party Supabase anon key may not have read access (RLS). Odds from BDL still load normally.
        </div>
      )}

      {hrCount > 0 && (
        <button onClick={() => setShowHrBoard(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '7px 14px', borderRadius: 999,
          border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.1)', color: '#4ade80',
          fontSize: 12, fontWeight: 800, cursor: 'pointer',
        }}>
          🔥 Today's Home Runs
          <span style={{ background: 'rgba(74,222,128,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{hrCount}</span>
        </button>
      )}

      {/* Game tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {games.map(g => {
          const isAct = g.gameKey === activeGame
          const isLive = g.status === 'Live'
          const isFin  = g.status === 'Final'
          return (
            <button key={g.gameKey} onClick={() => setActive(g.gameKey)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              border: isAct ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: isAct ? 'var(--accent-dim)' : 'var(--surface)',
              color: isAct ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 11, fontWeight: 700, transition: 'all 120ms',
            }}>
              <TeamLogo abbr={g.awayAbbr} size={16} />
              <span style={{ color: 'var(--text-3)', fontSize: 9 }}>@</span>
              <TeamLogo abbr={g.homeAbbr} size={16} />
              {g.gameNum > 1 && <span style={{ fontSize: 9, fontWeight: 900, color: '#f59e0b' }}>G{g.gameNum}</span>}
              {isLive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444' }} />}
              {(isLive || isFin) && <span style={{ fontSize: 10, fontFamily: 'monospace' }}>{g.awayScore}–{g.homeScore}</span>}
              {!isLive && !isFin && g.gameDate && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'monospace' }}>
                  {new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {active && (
        <GameTable
          key={active.gameKey}
          game={active}
          date={date}
          splitMap={splitMap}
          timingMap={timingMap}
          pitcherMap={pitcherMap}
          fhrAvgMap={fhrAvgMap}
          saAvgMap={saAvgMap}
          pikkitMap={pikkitMap}
          openingMap={openingMap}
          batterPitchMap={batterPitchMap}
          pitcherPitchMap={pitcherPitchMap}
          gameLogMap={gameLogMap}
          platoonMap={platoonMap}
          pitchEventsMap={pitchEventsMap}
          hrMap={hrMap}
          nearMap={nearMap}
          highlightMlbId={highlightId}
        />
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6 }}>
        Hover any column header for details.
      </div>

      {showHrBoard && (
        <HrLeaderboard
          hits={data.hrFeed ?? []}
          teamByMlbId={teamByMlbId}
          onJumpToGame={gk => { setActive(gk); setShowHrBoard(false) }}
          onClose={() => setShowHrBoard(false)}
        />
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Direct-child combinators only — the expanded drilldown row's own
           <td colSpan={99}> is a direct child of this table's tbody, but the
           nested pitch-mix/matchup tables inside it are many levels further
           down, not direct children, so their own heat-mapped cell colors
           survive hovering instead of getting flattened to this grey. */
        .dugout-dense-table > tbody > tr:hover > td{background:rgba(255,255,255,0.025)!important}
      `}</style>
    </div>
  )
}
