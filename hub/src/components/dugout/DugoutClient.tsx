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
import { StatTile } from '@/components/pitcher-report/MatchupTables'
import { normName, resolveNameEntry } from '@/lib/nameNorm'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'
import { MatchupPitchBreakdown } from '@/components/dugout/MatchupPitchBreakdown'
import { GameWeatherCard } from '@/components/dugout/GameWeatherCard'
import { RecentFormSplits } from '@/components/dugout/RecentFormSplits'

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function buildPlatoonMap(rows: any[]) {
  const map: Record<string, { vl?: any; vr?: any }> = {}
  for (const r of rows) {
    const id = String(r.mlb_id || '')
    if (!id || (r.split_code !== 'vl' && r.split_code !== 'vr')) continue
    ;(map[id] ??= {})[r.split_code as 'vl' | 'vr'] = r
  }
  return map
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
  // Same fuzzy fallback as everywhere else — only actually needed on the
  // by-name path (by-id is exact regardless of spelling), so resolved once
  // here rather than per pitch-type in the loop below.
  const byNameEntry = timingMap.byName[batterName] ?? resolveNameEntry(timingMap.byName, batterName)

  let st = 0, rt = 0, sm = 0, rm = 0
  let sw = 0, rw = 0, smw = 0, rmw = 0
  for (const [pt, w] of mix) {
    const tRows =
      timingMap.byId[batterId]?.[pitcherHand]?.[pt] ||
      byNameEntry?.[pitcherHand]?.[pt]
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
type PlatoonMap = ReturnType<typeof buildPlatoonMap>

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
  const batterEntry = batterPitchMap[nn] ?? resolveNameEntry(batterPitchMap, nn)
  let sum = 0, wsum = 0
  for (const [pt, usage] of mix) {
    const batEdge = batterEntry?.[pt]?.[pitcherHand]
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
  platoonMap: PlatoonMap,
  // Only meaningful once the real lineup posts — the away team bats first
  // every inning, so the away 9-hole hitter still gets his first PA before
  // ANY home batter does; a home 9-hole hitter is realistically the very
  // last of all 18 to get a first look. Used to weight FHR conviction by
  // how little "first at-bat" opportunity a guy actually has. Projected
  // (unconfirmed) rosters carry the FULL bench, not a real batting order —
  // batting_order there is just a position-priority index, not a real
  // sequence — so this is only trustworthy when lineupConfirmed is true.
  isHome: boolean = false,
  lineupConfirmed: boolean = false,
) {
  const idKey = String(player.mlb_id || '')
  const nn    = player.name_norm || normName(player.name || '')

  // Same nickname/suffix-tolerant matching as the FanDuel/BetMGM join in
  // /api/dugout/data — each of these maps is keyed by a name_norm computed
  // from a DIFFERENT source (Pikkit's own scrape, mlb-party's HR feed,
  // BDL's own opening-odds average) than the roster's own MLB-fullName-
  // derived nn, so an exact-string lookup silently drops a player's picks/
  // averages on the same class of mismatch (Cam/Cameron, Jr./no-Jr., etc.)
  // that was already fixed for FD/MGM.
  const pikkitEntry  = resolveNameEntry(pikkitMap, nn)
  const openingEntry = resolveNameEntry(openingMap, nn)
  const hrEntry       = resolveNameEntry(hrMap, nn)
  const nearEntry     = resolveNameEntry(nearMap, nn)
  const fhrAvgEntry   = resolveNameEntry(fhrAvgMap, nn)
  const saAvgEntry    = resolveNameEntry(saAvgMap, nn)

  const playerSplits = splitMap.byId[idKey] ?? splitMap.byName[nn] ?? resolveNameEntry(splitMap.byName, nn)
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
  const recent_pitch_count = Object.values(batterPitchMap[nn] ?? resolveNameEntry(batterPitchMap, nn) ?? {})
    .reduce((sum, byHand) => sum + Object.values(byHand).reduce((s2, r: any) => s2 + (r.pitches || 0), 0), 0)

  const props      = player.props
  const fhr_fd     = props?.fhr?.fanduel      ?? null
  const fhr_cz     = props?.fhr?.caesars      ?? null
  // Fanatics FHR and BetRivers anytime-HR — BDL carries both about as
  // reliably as the existing three books (confirmed live: ~96% coverage
  // vs FanDuel's own), just never surfaced as their own columns before.
  const fhr_fan    = props?.fhr?.fanatics     ?? null
  const sa_fd      = props?.sa?.fanduel       ?? null
  const sa_cz      = props?.sa?.caesars       ?? null
  const sa_mgm     = props?.sa?.betmgm        ?? null
  const sa_br      = props?.sa?.betrivers     ?? null
  const sng_fd     = props?.singles?.fanduel  ?? null
  const dbl_fd     = props?.doubles?.fanduel  ?? null
  const rbi_fd     = props?.rbi?.fanduel      ?? null
  const rbi2_fd    = props?.rbi2?.fanduel     ?? null
  const rbi3_fd    = props?.rbi3?.fanduel     ?? null
  const tb_fd      = props?.tb?.fanduel       ?? null
  const tb3_fd     = props?.tb3?.fanduel      ?? null
  const tb4_fd     = props?.tb4?.fanduel      ?? null
  const tb5_fd     = props?.tb5?.fanduel      ?? null
  const hr2_fd     = props?.hr2?.fanduel      ?? null
  const tri_fd     = props?.triples?.fanduel  ?? null
  const hrr_fd     = props?.hrr?.fanduel      ?? null
  // Real BDL markets that were already flowing through buildPropMap
  // (balldontlie.ts) but never surfaced as their own columns.
  const sb_fd      = props?.stolen_bases?.fanduel ?? null
  const hits_fd    = props?.hits?.fanduel     ?? null
  const runs_fd    = props?.runs?.fanduel     ?? null
  // The 2+ line for each of these markets — buildPropMap already buckets
  // them separately from the 1+ line (that's the exact fix for the "some
  // players showed 2+ under the 1+ column" bug), but the 2+ bucket itself
  // was never given its own column. Singles/doubles/triples deliberately
  // excluded here — FanDuel/BDL never actually posts a 2+ line for those
  // three, so sng2_fd/dbl2_fd/tri2_fd were always-empty columns.
  const sb2_fd     = props?.stolen_bases2?.fanduel ?? null
  const hits2_fd   = props?.hits2?.fanduel    ?? null
  const runs2_fd   = props?.runs2?.fanduel    ?? null
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
  const tbFd_open      = open.tbFd     ?? null
  const tb3Fd_open     = open.tb3Fd    ?? null
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
  const sa_div_tb   = implRatio(sa_fd, tb_fd)
  const sa_div_tb3  = implRatio(sa_fd, tb3_fd)
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
  const opening = openingEntry
  const sa_rbi_raw_ratio = rawRatio(opening?.sa_open ?? null, opening?.rbi_open ?? null)
  const picks_count = (pikkitEntry?.home_runs?.picks as number | undefined) ?? null
  const is_money_sa_rbi = sa_rbi_raw_ratio != null && sa_rbi_raw_ratio >= 3.5
                        && picks_count != null && picks_count <= 50

  // 1-18 global "who gets a first-PA look first" rank, once the real lineup
  // is out — away bats first every inning, so away's own order 1-9 maps to
  // ranks 1-9 and home's to ranks 10-18. null pre-confirmation, since a
  // projected lineup's batting_order is a position-priority index over the
  // full bench, not a real sequence.
  const bat_rank = lineupConfirmed ? (isHome ? 9 + (player.batting_order as number) : (player.batting_order as number)) : null

  return {
    mlb_id:        player.mlb_id as number | null,
    name:          player.name   as string,
    name_norm:     nn,
    batting_order: player.batting_order as number,
    position:      player.position as string,
    bats:          player.bats    as string,
    team:          player.team    as string,
    fhr_fd, fhr_cz, fhr_fan, div, fhr_div_sa,
    // Shade %: today's price vs own season-average price (negative = cheaper
    // than usual = book conviction). Ported exactly from mlb-party: FHR% only
    // compares FanDuel-to-FanDuel; HR% (SA) falls back to Caesars if FD's own
    // average is missing.
    fhr_pct: (() => {
      const avgFd = fhrAvgEntry?.fd
      return fhr_fd != null && avgFd ? (fhr_fd - avgFd) / avgFd : null
    })(),
    sa_pct: (() => {
      const av = saAvgEntry ?? {}
      if (sa_fd != null && av.fd) return (sa_fd - av.fd) / av.fd
      if (sa_fd != null && av.cz) return (sa_fd - av.cz) / av.cz
      return null
    })(),
    // Raw odds-POINT delta (current − own average), not the percentage —
    // used to weight the shade heat-map's intensity instead of fhr_pct/
    // sa_pct's own magnitude. A 30% swing off an +800 average is a ~240-point
    // real market move; the same 30% off a +300 average is only ~90 points —
    // the percentage alone treats those as equally significant, the raw
    // point swing correctly doesn't.
    fhr_delta: (() => {
      const avgFd = fhrAvgEntry?.fd
      return fhr_fd != null && avgFd ? fhr_fd - avgFd : null
    })(),
    sa_delta: (() => {
      const av = saAvgEntry ?? {}
      if (sa_fd != null && av.fd) return sa_fd - av.fd
      if (sa_fd != null && av.cz) return sa_fd - av.cz
      return null
    })(),
    bat_rank,
    // FHR-only (batting order doesn't meaningfully bias ANYTIME-HR chances
    // the way it does "who's literally first") — scales fhr_delta by how
    // little first-PA opportunity this spot in the order actually gets: 0.75x
    // for the very first hitter of the game up to 1.5x for the very last, so
    // real conviction on a 9-hole home bat reads brighter than the same-size
    // move on a leadoff man who was already likely to be first up regardless.
    // Falls back to the plain (unweighted) delta until the lineup posts.
    fhr_delta_weighted: (() => {
      const avgFd = fhrAvgEntry?.fd
      const delta = fhr_fd != null && avgFd ? fhr_fd - avgFd : null
      if (delta == null || bat_rank == null) return delta
      const orderWeight = 0.75 + (bat_rank - 1) / 17 * 0.75
      return delta * orderWeight
    })(),
    sa_fd, sa_cz, sa_mgm, sa_br, m_div_f,
    sa_div_rbi, sa_div_rbi2, sa_div_rbi3, sa_div_tb, sa_div_tb3, sa_div_tb4, sa_div_tb5, sa_div_hr2, sa_div_hrr,
    sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hr2_fd, hrr_fd, sb_fd, hits_fd, runs_fd,
    sb2_fd, hits2_fd, runs2_fd,
    laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hrMl_fd, pa1_div_sa, sa_div_ml,
    fhr_open, saFd_open, hr2Fd_open, sngFd_open, dblFd_open, triFd_open, rbiFd_open, rbi2Fd_open, rbi3Fd_open, tbFd_open, tb3Fd_open, tb4Fd_open, tb5Fd_open, hrrFd_open,
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
    // Each market (home_runs, hits, runs, stolen_bases, ...) is kept as its
    // own entry now — a player can have picks in more than one market for
    // the same game, and collapsing them into a single row (the old
    // behavior) meant whichever market won the collapse got mislabeled as
    // "HR" everywhere it rendered. `pk` stays HR-specific (matching its
    // column header); the others ride along on their own matching odds cell.
    pk:      pikkitEntry?.home_runs ?? null,
    pkHits:  pikkitEntry?.hits ?? null,
    pkRuns:  pikkitEntry?.runs ?? null,
    pkStolenBases: pikkitEntry?.stolen_bases ?? null,
    pkSingles: pikkitEntry?.singles ?? null,
    pkDoubles: pikkitEntry?.doubles ?? null,
    pkTriples: pikkitEntry?.triples ?? null,
    pkRbi:     pikkitEntry?.rbi ?? null,
    pkHrr:     pikkitEntry?.hits_runs_rbi ?? null,
    pkTb:      pikkitEntry?.bases ?? null,
    hr_hits: hrEntry    ?? [],
    near_hr: nearEntry  ?? null,
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

// rgb defaults to FanDuel blue — pass a book's own brand triplet (see
// BookLogo.tsx) to color-code a column by which book it actually is,
// instead of every odds column reading as "FanDuel blue" regardless of book.
function oddsHeat(v: number | null, all: (number | null)[], rgb: string = '20,147,255'): React.CSSProperties {
  if (v == null) return {}
  const impls = all.map(toImpl).filter((x): x is number => x != null)
  const mine  = toImpl(v)
  if (mine == null || impls.length < 2) return {}
  const mn = Math.min(...impls), mx = Math.max(...impls)
  if (mx === mn) return {}
  const t = (mine - mn) / (mx - mn)
  if (t < 0.5) return {}
  return { background: `rgba(${rgb},${0.05 + t * 0.18})` }
}

// Sign-based text coloring for the FHR%/HR% "shade" columns — deliberately
// NOT rank-based like heat()/oddsHeat() above: green/red is fixed by sign,
// near-zero always yellow, regardless of where it falls in the pool.
//
// NEGATIVE is GREEN, not red: fhr_pct/sa_pct is (today's price − own
// season-average price) ÷ average (see buildBatterRow) — negative means
// today's price is CHEAPER/shorter than this player's own usual price, i.e.
// real book conviction they're more likely today than average. Confirmed
// against a real result: Henry Davis posted -5.7% FHR / -12.8% HR and went
// on to hit the actual first HR of that game — negative was the right call,
// positive (price drifted longer than usual) is the bearish one.
//
// INTENSITY is driven by the raw odds-POINT delta (fhr_delta/sa_delta), NOT
// by pct's own magnitude — a 30% swing off an +800 average is a ~240-point
// real market move, the same 30% off a +300 average only ~90 points. Ranking
// by percentage would treat those as equally significant; ranking by the
// actual point swing (against the pool's own point swings — teammates for
// HR%, whole game for FHR%) doesn't.
function shadeColor(pct: number | null, delta: number | null, deltaPool: (number | null)[]): React.CSSProperties {
  if (pct == null) return { color: 'var(--text-3)' }
  const mags = deltaPool.filter((x): x is number => x != null).map(x => Math.abs(x))
  const maxMag = mags.length ? Math.max(...mags) : 0
  const intensity = maxMag > 0 && delta != null ? Math.min(Math.abs(delta) / maxMag, 1) : 0
  if (Math.abs(pct) < 0.03) return { color: '#eab308', fontWeight: 700 }
  const alpha = 0.55 + intensity * 0.45
  return { color: pct < 0 ? `rgba(74,222,128,${alpha})` : `rgba(248,113,113,${alpha})`, fontWeight: 700 }
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
// A single sticky-mode entry — `rank` is its 1-based priority in the active
// multi-column sort chain (1 = primary key), shown as a small superscript so
// it's clear which column is breaking ties for which.
type MultiSortEntry = { col: string; dir: 'desc' | 'asc' }

function TH({
  label, title, w = 40, sticky = false, sortKey, active = false, dir, rank, onSort,
  pickSortKey, pickActive = false, pickDir, pickRank, onPickSort,
}: {
  label: React.ReactNode; title?: string; w?: number; sticky?: boolean
  sortKey?: string; active?: boolean; dir?: 'desc' | 'asc'; rank?: number; onSort?: (key: string) => void
  // Independent second sort control for whichever column this stat's real
  // community pick count lives on — same sticky multi-sort chain as the
  // main column, just keyed to a different field (buildBatterRow's own
  // pk*.picks), so "most picked" and "best odds" can each drive the sort
  // without one replacing the other's column.
  pickSortKey?: string; pickActive?: boolean; pickDir?: 'desc' | 'asc'; pickRank?: number; onPickSort?: (key: string) => void
}) {
  // The sticky Player column (only sticky=true caller) gets a narrower fixed
  // width on mobile to match its <td>, so more of the ~60 scrollable stat
  // columns fit on screen — inline width has to move to a className for that
  // one column since inline styles always win over responsive Tailwind classes.
  const responsiveSticky = sticky && w === 190
  // STH's overflow:hidden/whiteSpace:nowrap/textOverflow:ellipsis are meant
  // to single-line-truncate a long label — reported live, applied to the
  // whole <th> they clipped the PICKS line right out of view entirely
  // instead of just truncating overlong label text. Moved onto the label
  // span alone so the cell itself sizes to fit both lines (row genuinely
  // grows taller, which is the whole point) while long labels still ellipsis.
  const { overflow: _thOverflow, textOverflow: _thTextOverflow, whiteSpace: _thWhiteSpace, ...sthRest } = STH
  return (
    <th
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
      className={responsiveSticky ? 'w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]' : undefined}
      style={{
        ...sthRest,
        ...(responsiveSticky ? {} : { width: w, minWidth: w, maxWidth: w }),
        ...(sticky ? { position: 'sticky', left: 0, zIndex: 4 } : {}),
        color: active ? 'var(--accent)' : 'var(--text-2)',
      }}
    >
      <Tooltip content={title ?? ''}>
        <span style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {label}{active ? (dir === 'desc' ? '▼' : '▲') : ''}
          {active && rank != null && <sup style={{ fontSize: 7, marginLeft: 1 }}>{rank}</sup>}
        </span>
      </Tooltip>
      {pickSortKey && (
        <Tooltip content="Sort by community pick count on this line">
          <div
            onClick={e => { e.stopPropagation(); onPickSort?.(pickSortKey) }}
            style={{ fontSize: 7, fontWeight: 900, lineHeight: 1, marginTop: 1, cursor: 'pointer', color: pickActive ? 'var(--accent)' : 'var(--text-3)' }}
          >
            PICKS{pickActive ? (pickDir === 'desc' ? '▼' : '▲') : ''}
            {pickActive && pickRank != null && <sup style={{ fontSize: 6, marginLeft: 1 }}>{pickRank}</sup>}
          </div>
        </Tooltip>
      )}
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
    if (busy || !wl.signedIn) return
    setBusy(true)
    try {
      if (saved) {
        const existing = wl.items.find(i => i.status === 'pending' && i.mlb_id === (oppPitcher.id ?? null) && i.prop_key === propKey && i.book === 'fanduel')
        if (existing) await wl.remove(existing.id)
        return
      }
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
    <Tooltip content={saved ? 'Saved to watchlist — click to remove' : 'Click to add to watchlist'}>{pill}</Tooltip>
  ) : pill
}

function PlayerDrillDown({
  row, oppPitcher, pitcherTeamAbbr, gameInfo, pool,
}: {
  row: BatterRow
  oppPitcher?: any
  pitcherTeamAbbr: string
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  // Heat-maps the Bat Tracking tiles against the rest of tonight's lineups —
  // same "heat-mapped vs the rest of this lineup" convention as Pitcher
  // Report's PlayerStatcastDetail.
  pool: BatterRow[]
}) {
  const pitcherHand: 'R' | 'L' = oppPitcher?.hand === 'L' ? 'L' : 'R'
  const noBatSplits = !row.s_spd && !row.s_brl

  return (
    <td colSpan={99} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '2px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

        {/* Real pitch-by-pitch matchup — genuine Statcast rows off
            player_pitch_log via batterStatsEngine.ts, the same engine and
            recency-window model Slate Breakdown's PitcherVsLineup uses.
            Replaces the old mlb-party 14-day/live-window pipeline, which
            only ever offered a fixed 14-day rolling window or a capped
            ~20-pitch event popup. */}
        {oppPitcher && row.mlb_id != null ? (
          <div style={{ minWidth: 460 }}>
            <MatchupPitchBreakdown
              batterId={row.mlb_id}
              batterName={row.name}
              batterBats={row.bats}
              pitcherId={oppPitcher.id}
              pitcherName={oppPitcher.name}
              pitcherHand={pitcherHand}
              pitcherTeamAbbr={pitcherTeamAbbr}
            />
            <div style={{ marginTop: 8 }}>
              <PitcherStrikeoutsChip oppPitcher={oppPitcher} gameInfo={gameInfo} />
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>No pitcher data</div>
        )}

        {/* Bat tracking — same StatTile grid as Pitcher Report's own
            PlayerStatcastDetail, heat-mapped against tonight's full pool
            (both lineups) instead of a plain table. */}
        {!noBatSplits && (() => {
          const g = (k: keyof BatterRow) => pool.map(p => p[k] as number | null)
          return (
          <div style={{ minWidth: 320 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 6 }}>
              BAT TRACKING
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
            {row.mlb_id != null && <RecentFormSplits batterId={row.mlb_id} pitcherHand={pitcherHand} />}
            {/* Ballpark conditions — same park-shape/wind visual as Weather
                Lab, scoped to just this game. Stacked under Bat Tracking/
                Recent Form & Splits (not a separate flex item) so it stays
                right beside the matchup arsenal column on smaller screens
                instead of wrapping below both columns and needing a scroll. */}
            {gameInfo.game_pk && gameInfo.game_date && (
              <div style={{ marginTop: 14 }}>
                <GameWeatherCard gamePk={gameInfo.game_pk} date={gameInfo.game_date} />
              </div>
            )}
          </div>
          )
        })()}
      </div>
    </td>
  )
}

// ─── watchlist-able odds cell ─────────────────────────────────────────────────
function OddsCell({
  row, gameInfo, propKey, book, odds, style, display, badge, openOdds, pickCount,
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
  // Community pick count from Pikkit for this EXACT market (not just HR) —
  // rendered as a small corner tag so a pick count only ever shows up next
  // to the specific stat it's actually for.
  pickCount?: number | null
}) {
  const wl = useWatchlist()
  const [busy, setBusy] = useState(false)
  const meta = PROP_META[propKey]

  if (odds == null) {
    // No sportsbook line for this market doesn't mean no Pikkit picks for
    // it — a pick count is independent of whether FanDuel happens to have
    // posted odds yet, so it shouldn't silently disappear just because the
    // odds side of the cell has nothing to show.
    if (pickCount == null) return <td style={style}>—</td>
    return (
      <td style={style}>
        —
        <Tooltip content={`${pickCount.toLocaleString()} community ${meta?.label ?? propKey} picks`}>
          <div style={{ fontSize: 7, fontWeight: 900, color: 'var(--accent)', cursor: 'help', lineHeight: 1, marginTop: 1 }}>
            {pickCount >= 1000 ? `${(pickCount / 1000).toFixed(1)}k` : pickCount}
          </div>
        </Tooltip>
      </td>
    )
  }

  const saved = wl.isSaved(row.mlb_id, propKey, book)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy || !wl.signedIn) return
    setBusy(true)
    try {
      // Toggle: clicking an already-saved pick removes it instead of being a
      // no-op — otherwise the only way off the watchlist was opening the
      // panel and removing it from there.
      if (saved) {
        const existing = wl.items.find(i => i.status === 'pending' && i.mlb_id === row.mlb_id && i.prop_key === propKey && i.book === book)
        if (existing) await wl.remove(existing.id)
        return
      }
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
    wl.signedIn ? (saved ? 'Saved to watchlist — click to remove' : `Click to add ${meta?.label ?? propKey} @ ${book} to watchlist`) : null,
    deltaTitle,
  ].filter(Boolean).join(' · ') || undefined

  // Wrapped in its own column flex — when this renders inside the
  // title-tooltip's row-flex container below, an unwrapped fragment would
  // lay the pick-count line out BESIDE the odds instead of under it. This
  // div is the single flex child of that outer container either way, so it
  // controls its own internal stacking regardless of which branch renders it.
  const cellContent = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      {badge && (
        <Tooltip content={badge.title}>
          <div style={{ fontSize: 6.5, fontWeight: 900, color: badge.color, letterSpacing: '0.03em', lineHeight: 1, cursor: 'help' }}>
            {badge.label}
          </div>
        </Tooltip>
      )}
      <span>
        {display ?? oStr(odds)}
        {hasDelta && (
          <span style={{ marginLeft: 2, fontSize: 8, color: odds! < openOdds! ? '#4ade80' : '#f87171' }}>
            {odds! < openOdds! ? '▼' : '▲'}
          </span>
        )}
      </span>
      {saved && <span style={{ position: 'absolute', top: 1, right: 1, fontSize: 6 }}>★</span>}
      {pickCount != null && (
        <Tooltip content={`${pickCount.toLocaleString()} community ${meta?.label ?? propKey} picks`}>
          <div style={{ fontSize: 7, fontWeight: 900, color: 'var(--accent)', cursor: 'help', lineHeight: 1 }}>
            {pickCount >= 1000 ? `${(pickCount / 1000).toFixed(1)}k` : pickCount}
          </div>
        </Tooltip>
      )}
    </div>
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
  // Sticky column's hover treatment is computed here in JS rather than via
  // the table's generic `tr:hover > td` CSS rule — that rule needed an
  // !important override to stay opaque on hover (see the stylesheet at the
  // bottom of this file), which reintroduced the exact bleed-through bug
  // it was fixing whenever Sticky Columns re-sorts and reorders the tbody's
  // <tr> nodes out from under a stationary cursor: the browser's :hover
  // match can end up on stale DOM state right after a reorder, which the
  // !important war is powerless to fix since it's not a specificity
  // problem. Tracking hover as real component state sidesteps the whole
  // class of issue — it's driven by actual mouseenter/mouseleave on this
  // row's own node, not a CSS pseudo-class that has to survive reordering.
  const [hovered, setHovered] = useState(false)
  const g = (f: keyof BatterRow) => pool.map(r => r[f] as number | null)
  // FHR%'s shade is meaningful across the WHOLE game (all ~18 batters, both
  // teams — BDL's FanDuel FHR average is one shared per-game market), but
  // HR%'s shade should only be weighed against this player's own TEAMMATES,
  // not the opposing lineup too.
  const teammates = pool.filter(r => r.team === row.team)
  const gTeam = (f: keyof BatterRow) => teammates.map(r => r[f] as number | null)
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
    <tr
      id={id}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={hasHr ? { background: 'rgba(74,222,128,0.05)' } : undefined}
    >
      {/* sticky player cell — narrower on mobile (140px vs 190px) so more of
          the ~60 scrollable stat columns are visible without scrolling past
          a name column that's eating half a 375px viewport. Width/min/max
          moved out of inline style into the className since inline styles
          always beat responsive Tailwind classes for the same property. */}
      <td
        onClick={onToggle}
        className="dg-sticky-col w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]"
        style={{
          ...STD, position: 'sticky', left: 0, zIndex: 2, cursor: 'pointer',
          // Reported live (mobile): odds-column values from further right in
          // the row showed up bleeding through the player name/position
          // text on highlighted (confirmed-HR) rows specifically. Root
          // cause — a `position: sticky` cell MUST be fully opaque, since
          // its whole job is to mask the columns scrolling underneath it,
          // but the highlighted-row background here was a translucent
          // rgba() tint (8% alpha), so ~92% of whatever had scrolled
          // beneath it showed straight through. Pre-blended to the same
          // visual color against --bg (#06070A) as a solid hex instead —
          // the non-sticky cells in the same row keep the real rgba() tint
          // (they don't have anything to occlude, so translucency there is
          // fine, same reasoning `expanded` already followed here).
          backgroundColor: expanded ? '#10160e' : hasHr ? '#0b1813' : 'var(--bg)',
          backgroundImage: hovered ? 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, padding: '4px 4px' }}>
          {/* Order#/hand-circle "rail" — achievement-style flags (an FHR/HR
              that already happened, or a near-miss dart count) now stack
              underneath it instead of sharing the name line. Icon-only
              here since this column is narrow; full detail is still in the
              tooltip, and a "+N" marks additional active signals. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', width: 10, textAlign: 'right' }}>{row.batting_order}</span>
              <Tooltip content={row.bats === 'S' ? 'Switch hitter' : row.bats === 'L' ? 'Bats left' : 'Bats right'}>
                <span
                  style={{
                    flexShrink: 0, width: 14, height: 14, borderRadius: '50%', fontSize: 8, fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'help',
                    color: handColor, border: `1px solid ${handColor}`, background: `${handColor}18`,
                  }}
                >{row.bats || '?'}</span>
              </Tooltip>
            </div>
            {badgeSignals.length > 0 && (
              <Tooltip content={badgeSignals.map(s => s.detail).join(' · ')}>
                <span
                  onClick={badgeSignals[0].clickable ? (e) => { e.stopPropagation(); onShowHr?.() } : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, lineHeight: 1,
                    color: badgeSignals[0].color, background: badgeSignals[0].bg, border: `1px solid ${badgeSignals[0].border}`,
                    borderRadius: 4, padding: '1px 3px', cursor: badgeSignals[0].clickable ? 'pointer' : 'help',
                  }}
                >
                  {badgeSignals[0].icon}
                  {badgeSignals.length > 1 && <span style={{ fontSize: 6, marginLeft: 1 }}>+{badgeSignals.length - 1}</span>}
                </span>
              </Tooltip>
            )}
          </div>
          {row.mlb_id ? (
            <Link href={`/players/${row.mlb_id}`} onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
              <PlayerAvatar mlbId={row.mlb_id} size={24} teamAbbr={row.team} name={row.name} />
            </Link>
          ) : (
            <PlayerAvatar mlbId={row.mlb_id} size={24} teamAbbr={row.team} name={row.name} />
          )}
          <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            {/* Name line's width is now fixed regardless of how many flags
                are active — every badge moved off it (achievement flags to
                the rail above, signal flags to the position/hand line
                below), so a long name or a player with several flags at
                once no longer squeezes it down to almost nothing. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: expanded ? 'var(--accent)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 32 }}>
                {row.name}
              </span>
              <WatchlistStarButton
                mlbId={row.mlb_id} name={row.name} team={row.team} position={row.position} bats={row.bats}
                gameInfo={gameInfo} odds={row.sa_fd} oddsByBook={row.rawProps?.sa as Record<string, number> | undefined}
              />
            </div>
            {/* flexWrap here (not nowrap) is the fix for a real bug: on the
                narrow 140px mobile sticky column there often isn't room for
                position + hand + both signal badges on one line, and the
                parent's overflow:hidden (removed above) was silently
                clipping whichever badge didn't fit — invisible, not just
                truncated. Wrapping to a second line means everything stays
                visible; the row just gets a little taller when it needs to. */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, textAlign: 'left', flexWrap: 'wrap', rowGap: 2,
              fontSize: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
            }}>
              <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{row.position}</span>
              <span style={{ color: 'var(--text-4)' }}>·</span>
              <span style={{ color: handColor, fontWeight: 700 }}>{row.bats === 'S' ? 'SHB' : `${row.bats}HB`}</span>
              {/* Signal-style flags (predictive, not history) — same
                  relocation reasoning as the badges above. */}
              {hasLiveMatchup && (
                <Tooltip content="Live matchup edge — recently hitting the exact pitch(es) this pitcher throws hard, and this pitcher's been getting hit hard on that same pitch lately too">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', fontSize: 9, flexShrink: 0, lineHeight: 1,
                    color: '#4ade80', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)',
                    padding: '1px 3px', borderRadius: 3, cursor: 'help',
                  }}>⚡</span>
                </Tooltip>
              )}
              {row.is_money_sa_rbi && (
                <Tooltip content="Value flag — this player's HR price looks cheap relative to his RBI price, with low community attention so far">
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', fontSize: 9, flexShrink: 0, lineHeight: 1,
                    color: '#f59e0b', background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
                    padding: '1px 3px', borderRadius: 3, cursor: 'help',
                  }}>💰</span>
                </Tooltip>
              )}
            </div>
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

      {/* FHR — each book's heat background uses its own brand color (see
          BookLogo.tsx) instead of one blue for every column regardless of
          book. */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="fanduel" odds={row.fhr_fd} openOdds={row.fhr_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_fd, g('fhr_fd'), '20,147,255') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="caesars" odds={row.fhr_cz} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_cz, g('fhr_fd'), '11,64,50') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="fanatics" odds={row.fhr_fan} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_fan, g('fhr_fd'), '218,25,55') }} />
      <td style={{ ...STD, width: 36, minWidth: 36, color: row.div != null ? (row.div > 0.008 ? '#4ade80' : row.div < -0.008 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {row.div != null ? (row.div >= 0 ? '+' : '') + (row.div * 100).toFixed(1) : '—'}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.fhr_div_sa, g('fhr_div_sa')) }}>{f2(row.fhr_div_sa)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...shadeColor(row.fhr_pct, row.fhr_delta_weighted, g('fhr_delta_weighted')) }}>{row.fhr_pct != null ? `${(row.fhr_pct * 100).toFixed(1)}%` : '—'}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...shadeColor(row.sa_pct, row.sa_delta, gTeam('sa_delta')) }}>{row.sa_pct  != null ? `${(row.sa_pct  * 100).toFixed(1)}%` : '—'}</td>

      <td style={SDIV_D} />

      {/* SA (anytime HR) */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="fanduel" odds={row.sa_fd} openOdds={row.saFd_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_fd, g('sa_fd'), '20,147,255') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="caesars" odds={row.sa_cz} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_cz, g('sa_fd'), '11,64,50') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="betmgm" odds={row.sa_mgm} openOdds={row.saMgm_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_mgm, g('sa_fd'), '184,150,12') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="betrivers" odds={row.sa_br} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_br, g('sa_fd'), '0,48,135') }} />
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
        pickCount={row.pkRbi?.picks ?? null}
      />
      <OddsCell row={row} gameInfo={gameInfo} propKey="rbi2" book="fanduel" odds={row.rbi2_fd} openOdds={row.rbi2Fd_open} display={f2(row.sa_div_rbi2)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_rbi2, g('sa_div_rbi2')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="rbi3" book="fanduel" odds={row.rbi3_fd} openOdds={row.rbi3Fd_open} display={f2(row.sa_div_rbi3)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_rbi3, g('sa_div_rbi3')) }} />
      {/* No openOdds here on purpose: BDL's own HRR line is variable-threshold
          per player (hrr_line in balldontlie.ts) — our opening capture is
          always the exact "1+" section, so BDL's current could silently be a
          2+/3+ line for a different player. Showing a delta would compare
          two different markets as if they were the same one. */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="hrr" book="fanduel" odds={row.hrr_fd} display={f2(row.sa_div_hrr)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_hrr, g('sa_div_hrr')) }} pickCount={row.pkHrr?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="tb" book="fanduel" odds={row.tb_fd} openOdds={row.tbFd_open} display={f2(row.sa_div_tb)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_tb, g('sa_div_tb')) }} pickCount={row.pkTb?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="tb3" book="fanduel" odds={row.tb3_fd} openOdds={row.tb3Fd_open} display={f2(row.sa_div_tb3)} style={{ ...STD, width: 38, minWidth: 38, ...heat(row.sa_div_tb3, g('sa_div_tb3')) }} />
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
        pickCount={row.pkSingles?.picks ?? null}
      />
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="doubles" book="fanduel" odds={row.dbl_fd} openOdds={row.dblFd_open}
        style={{
          ...STD, width: 50, minWidth: 50, ...oddsHeat(row.dbl_fd, g('dbl_fd')),
          ...(row.is_pwr ? { borderTop: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b' } : {}),
        }}
        pickCount={row.pkDoubles?.picks ?? null}
      />
      <OddsCell
        row={row} gameInfo={gameInfo} propKey="triples" book="fanduel" odds={row.tri_fd} openOdds={row.triFd_open}
        style={{
          ...STD, width: 50, minWidth: 50, ...oddsHeat(row.tri_fd, g('tri_fd')),
          ...(row.is_pwr ? { borderTop: '2px solid #f59e0b', borderBottom: '2px solid #f59e0b', borderRight: '2px solid #f59e0b', boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.25)' } : {}),
        }}
        pickCount={row.pkTriples?.picks ?? null}
      />
      {/* Replaced HR÷C1/HR÷C2 (thin, manual-paste-only combine-for-HR
          ratios) with real BDL-sourced markets that were already flowing
          through buildPropMap but never shown. */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="stolen_bases" book="fanduel" odds={row.sb_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.sb_fd, g('sb_fd')) }} pickCount={row.pkStolenBases?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="stolen_bases2" book="fanduel" odds={row.sb2_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.sb2_fd, g('sb2_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="hits" book="fanduel" odds={row.hits_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hits_fd, g('hits_fd')) }} pickCount={row.pkHits?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="hits2" book="fanduel" odds={row.hits2_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hits2_fd, g('hits2_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="runs" book="fanduel" odds={row.runs_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.runs_fd, g('runs_fd')) }} pickCount={row.pkRuns?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="runs2" book="fanduel" odds={row.runs2_fd} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.runs2_fd, g('runs2_fd')) }} />

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
          <Link href={`/players/${row.mlb_id}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
            <PlayerAvatar mlbId={row.mlb_id} size={36} teamAbbr={row.team} name={row.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{row.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {row.team} · {row.position}{hasHr && hits.length > 1 ? ` · ${hits.length} HRs today` : ''}
              </div>
            </div>
          </Link>
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
      // hr_time is a real ISO timestamp (MLB's playByPlay about.endTime) —
      // game_pk/ab_index only orders at-bats WITHIN one game, so two
      // different games' HRs had no real relationship to each other and
      // this used to group the whole list by game first instead of true
      // chronological order across the slate.
      return new Date(a.hr_time ?? 0).getTime() - new Date(b.hr_time ?? 0).getTime()
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
                <Link href={`/players/${h.mlb_id}`} onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
                  <PlayerAvatar mlbId={h.mlb_id} size={32} teamAbbr={h._team} name={h.player_name} />
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{h.player_name}</span>
                    {h.is_first_hr_of_game && <span style={{ fontSize: 9, fontWeight: 800, color: '#fde047' }}>1ST</span>}
                    {isLaser110 && <span style={{ fontSize: 9, fontWeight: 800, color: '#f87171' }}>⚡110+</span>}
                    {isLaser105 && <span style={{ fontSize: 9, fontWeight: 800, color: '#fb923c' }}>⚡105+</span>}
                    {isMoonshot && <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa' }}>🌙</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                    <span>{h._team ?? ''} · off</span>
                    {/* Small enough (14px) that it doesn't grow the row height
                        beyond this text line's own — same ask as the batter
                        avatar, just scaled down since this is secondary info. */}
                    {h.pitcher_mlb_id ? (
                      <Link href={`/players/${h.pitcher_mlb_id}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
                        <PlayerAvatar mlbId={h.pitcher_mlb_id} size={14} name={h.pitcher_name} />
                      </Link>
                    ) : (
                      <PlayerAvatar mlbId={null} size={14} name={h.pitcher_name} />
                    )}
                    <span>{h.pitcher_name || '—'} · {h.half === 'top' ? '▲' : '▼'}{h.inning}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {/* Reported live: picking "Distance" (or "Time") re-sorted
                      the list correctly, but Exit Velo stayed the bold/primary
                      number on every row regardless — the visual hierarchy
                      never followed the active tab. The bold line now shows
                      whichever stat is actually being sorted on. */}
                  {sortBy === 'dist' ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{dist != null ? `${dist} ft` : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{ev != null ? `${ev} mph` : '—'}</div>
                    </>
                  ) : sortBy === 'time' ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{h.hr_time ? new Date(h.hr_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{ev != null ? `${ev} mph` : '—'}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{ev != null ? `${ev} mph` : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{dist != null ? `${dist} ft` : '—'}</div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── today's near-miss HR leaderboard ───────────────────────────────────────
// Same shape as HrLeaderboard above (EV/Distance/Time tabs, jump-to-game),
// but for near_hrs — real batted balls that would've left the park in at
// least one of the 30 real MLB parks but didn't leave THIS one (a warning-
// track flyout, a double off the wall, etc). near_hrs only ever stores the
// pitcher's NAME, not an id (unlike hrFeed) — pitcher_mlb_id here is a
// best-effort match against every pitcher who threw a pitch in a live game
// today (see pitcherIdByName in dugout/data/route.ts), so it's null for any
// near-miss whose pitcher that lookup didn't catch.
function NearHrLeaderboard({ nearHrs, teamByMlbId, onJumpToGame, onClose }: {
  nearHrs: any[]
  teamByMlbId: Record<number, { team: string; gameKey: string }>
  onJumpToGame: (gameKey: string) => void
  onClose: () => void
}) {
  const [sortBy, setSortBy] = useState<'ev' | 'dist' | 'time'>('dist')

  const sorted = useMemo(() => {
    const withMeta = nearHrs.map(n => ({ ...n, _team: teamByMlbId[n.batter_id]?.team ?? null, _gameKey: teamByMlbId[n.batter_id]?.gameKey ?? null }))
    return [...withMeta].sort((a, b) => {
      if (sortBy === 'ev') return (b.exit_velocity ?? -1) - (a.exit_velocity ?? -1)
      if (sortBy === 'dist') return (b.hit_distance ?? -1) - (a.hit_distance ?? -1)
      // near_hrs has no per-play MLB timestamp (statcast doesn't carry one
      // the way playByPlay's about.endTime does) — captured_at (when our own
      // scrape picked the row up, seconds after the real play) is the
      // closest real-world-order proxy available, same idea as hr_time above.
      return new Date(a.captured_at ?? 0).getTime() - new Date(b.captured_at ?? 0).getTime()
    })
  }, [nearHrs, teamByMlbId, sortBy])

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: 'rgba(251,146,60,0.1)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontSize: 18 }}>😮</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Today's Near Home Runs</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{nearHrs.length} ball{nearHrs.length === 1 ? '' : 's'} that would've left at least one real park</div>
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
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 12 }}>No near-misses yet today.</div>
          ) : sorted.map((n, i) => {
            const ev = n.exit_velocity, dist = n.hit_distance
            const parks = n.parks_hr_count
            // Would've left MOST parks — the closer this got to a real HR
            // across the league, the more it deserves the same red "almost
            // gone" emphasis HrLeaderboard gives an actual 105+ laser.
            const closeCall = parks != null && parks >= 20
            return (
              <div key={`${n.batter_id}-${n.inning}-${n.half_inning}-${i}`}
                onClick={() => n._gameKey && onJumpToGame(n._gameKey)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, cursor: n._gameKey ? 'pointer' : 'default', marginBottom: 4 }}
                onMouseEnter={e => n._gameKey && ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
              >
                <Link href={`/players/${n.batter_id}`} onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
                  <PlayerAvatar mlbId={n.batter_id} size={32} teamAbbr={n._team} name={n.batter_name} />
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{n.batter_name}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-2)' }}>{n.result || '—'}</span>
                    {parks != null && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: closeCall ? '#f87171' : 'var(--text-3)' }}>{parks}/30 parks</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                    <span>{n._team ?? ''} · off</span>
                    {n.pitcher_mlb_id ? (
                      <Link href={`/players/${n.pitcher_mlb_id}`} onClick={e => e.stopPropagation()} style={{ display: 'flex', flexShrink: 0 }}>
                        <PlayerAvatar mlbId={n.pitcher_mlb_id} size={14} name={n.pitcher_name} />
                      </Link>
                    ) : (
                      <PlayerAvatar mlbId={null} size={14} name={n.pitcher_name} />
                    )}
                    <span>{n.pitcher_name || '—'} · {n.half_inning === 'top' ? '▲' : '▼'}{n.inning}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {sortBy === 'dist' ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{dist != null ? `${dist} ft` : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{ev != null ? `${ev} mph` : '—'}</div>
                    </>
                  ) : sortBy === 'time' ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{n.captured_at ? new Date(n.captured_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{ev != null ? `${ev} mph` : '—'}</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', fontFamily: 'monospace' }}>{ev != null ? `${ev} mph` : '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{dist != null ? `${dist} ft` : '—'}</div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Every pk*-prefixed field (pk, pkRbi, pkHrr, pkTb, pkSingles, pkDoubles,
// pkTriples, pkStolenBases, pkHits, pkRuns — see buildBatterRow) is the
// whole pikkit object ({picks, prop_type, ...}), not a plain number, so the
// generic a[col] extraction below would diff two objects (always NaN) and
// silently never reorder anything.
function sortValue(r: BatterRow, col: string): number | null {
  if (col.startsWith('pk')) return (r[col as keyof BatterRow] as any)?.picks ?? null
  return r[col as keyof BatterRow] as unknown as number | null
}

// Multi-key version — `keys` is priority order, first = primary sort, each
// subsequent entry only breaks ties left by the ones before it. A plain
// single-column sort is just this called with a one-element array.
function sortRowsMulti(rows: BatterRow[], keys: MultiSortEntry[]): BatterRow[] {
  if (!keys.length) return rows
  return [...rows].sort((a, b) => {
    for (const { col, dir } of keys) {
      const av = sortValue(a, col)
      const bv = sortValue(b, col)
      if (av == null && bv == null) continue
      if (av == null) return 1
      if (bv == null) return -1
      if (av === bv) continue
      return dir === 'desc' ? bv - av : av - bv
    }
    return 0
  })
}

// The opposing-pitcher label at the top of each lineup used to be plain
// gray text ("vs RHP Robert Gasser") — no headshot, no way to tell hand at
// a glance, and no way to actually get to that pitcher's own page. Links
// straight into Pitcher Report with this exact pitcher pre-selected, same
// full-site-fluidity pattern as the batter links elsewhere in this file
// that jump the other direction (Pitcher Report -> Dugout via ?highlight=).
function PitcherLinkChip({ pitcher, teamAbbr }: { pitcher: { id: number; name: string; hand: string }; teamAbbr: string; date: string }) {
  return (
    <Tooltip content={`Open ${pitcher.name}'s player profile`}>
      <Link
        href={`/players/${pitcher.id}`}
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
function GameTable({ game, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap, highlightMlbId, date }: {
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
  platoonMap: PlatoonMap
  highlightMlbId?: number | null
  date: string
}) {
  const [sort, setSort] = useState<SortState>(null)
  // Sticky multi-column sort — when on, each header click ADDS that column
  // to the chain instead of replacing the sort outright (rank 1 = primary
  // key, rank 2 = tiebreaker, ...). Clicking a column already in the chain
  // cycles desc -> asc -> removed, so a single chain can mix directions
  // (e.g. most picks, highest SB, but LOWEST HR). Persists across toggling
  // sticky mode off/on so flipping it off to peek at a plain single sort
  // doesn't throw away the chain you built.
  const [stickyMode, setStickyMode] = useState(false)
  const [stickyCols, setStickyCols] = useState<MultiSortEntry[]>([])
  const highlightKey = highlightMlbId != null
    ? (game.homeLineup?.some((p: any) => p.mlb_id === highlightMlbId) ? `h-${highlightMlbId}` : `a-${highlightMlbId}`)
    : null
  const [expanded, setExpanded] = useState<string | null>(highlightKey)
  const [hrPopupRow, setHrPopupRow] = useState<BatterRow | null>(null)
  const toggleExpand = (key: string) => setExpanded(prev => prev === key ? null : key)

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

  const toggleSort = (col: string) => {
    if (stickyMode) {
      setStickyCols(prev => {
        const idx = prev.findIndex(s => s.col === col)
        if (idx === -1) return [...prev, { col, dir: 'desc' }]
        if (prev[idx].dir === 'desc') {
          const next = [...prev]
          next[idx] = { col, dir: 'asc' }
          return next
        }
        return prev.filter(s => s.col !== col)
      })
      return
    }
    setSort(prev => prev?.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  }

  // Priority-ordered active sort keys — the sticky chain when sticky mode is
  // on, else the single plain-sort column. Feeds both the row comparator and
  // each header's active/direction/rank display.
  const activeSortKeys: MultiSortEntry[] = stickyMode ? stickyCols : (sort ? [sort] : [])
  const sortInfo = (key?: string): { active?: boolean; dir?: 'desc' | 'asc'; rank?: number } => {
    if (!key) return {}
    const idx = activeSortKeys.findIndex(s => s.col === key)
    if (idx === -1) return {}
    return { active: true, dir: activeSortKeys[idx].dir, rank: stickyMode && activeSortKeys.length > 1 ? idx + 1 : undefined }
  }

  const { homeRows, awayRows, pool } = useMemo(() => {
    const ap = game.awayPitcher
    const hp = game.homePitcher
    const homeRows = game.homeLineup.map((p: any) =>
      buildBatterRow(p, ap?.hand || 'R', ap?.id ?? null, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap, true, !!game.homeLineupConfirmed)
    )
    const awayRows = game.awayLineup.map((p: any) =>
      buildBatterRow(p, hp?.hand || 'R', hp?.id ?? null, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap, false, !!game.awayLineupConfirmed)
    )
    const pool = [...homeRows, ...awayRows]
    computePaper(pool)
    computeRanks(pool)
    return { homeRows, awayRows, pool }
  }, [game, splitMap, timingMap, pitcherMap, fhrAvgMap, saAvgMap, pikkitMap, openingMap, hrMap, nearMap, batterPitchMap, pitcherPitchMap, platoonMap])

  const displayHome = sortRowsMulti(homeRows, activeSortKeys)
  const displayAway = sortRowsMulti(awayRows, activeSortKeys)

  const gameInfo = { sport: 'MLB', game_pk: game.gamePk != null ? String(game.gamePk) : null, game_date: date }

  const H = (label: React.ReactNode, title?: string, w = 40, sortKey?: string, pickSortKey?: string) => {
    const info = sortInfo(sortKey)
    const pickInfo = sortInfo(pickSortKey)
    return (
      <TH
        label={label} title={title} w={w} sortKey={sortKey} active={info.active} dir={info.dir} rank={info.rank} onSort={toggleSort}
        pickSortKey={pickSortKey} pickActive={pickInfo.active} pickDir={pickInfo.dir} pickRank={pickInfo.rank} onPickSort={toggleSort}
      />
    )
  }

  const BL = (vendor: string, prop: string, title?: string, w = 50, sortKey?: string, pickSortKey?: string) => {
    const info = sortInfo(sortKey)
    const pickInfo = sortInfo(pickSortKey)
    return (
      <TH
        label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><BookLogo vendor={vendor} size={13} />{prop}</span>}
        title={title} w={w} sortKey={sortKey} active={info.active} dir={info.dir} rank={info.rank} onSort={toggleSort}
        pickSortKey={pickSortKey} pickActive={pickInfo.active} pickDir={pickInfo.dir} pickRank={pickInfo.rank} onPickSort={toggleSort}
      />
    )
  }

  // Shared between the real <thead> and the repeated header row dropped in
  // between the home and away sections — a 50+ column header scrolled out
  // of view above the home lineup was otherwise unreadable by the time you
  // reached the away team's rows further down the same table.
  const headerCells = (
    <>
      <TH label="Player" title="Batting order" w={190} sticky sortKey="batting_order" {...sortInfo('batting_order')} onSort={toggleSort} />
      {H('pk', 'Community HR pick count', 34, 'pk')}
      <th style={SDIV_H} />
      {BL('fanduel', 'FHR', 'FanDuel First HR', 50, 'fhr_fd')}
      {BL('caesars', 'FHR', 'Caesars First HR', 50, 'fhr_cz')}
      {BL('fanatics', 'FHR', 'Fanatics First HR', 50, 'fhr_fan')}
      {H('div', 'FD−CZ implied diff ×100', 36, 'div')}
      {H('FHR÷HR', 'FHR implied ÷ Anytime HR implied', 36, 'fhr_div_sa')}
      {H('FHR%', 'FHR historical hit rate', 36, 'fhr_pct')}
      {H('HR%', 'Anytime HR historical rate', 36, 'sa_pct')}
      <th style={SDIV_H} />
      {BL('fanduel', 'HR', 'FanDuel Anytime HR', 50, 'sa_fd')}
      {BL('caesars', 'HR', 'Caesars Anytime HR', 50, 'sa_cz')}
      {BL('betmgm', 'HR', 'BetMGM Anytime HR', 50, 'sa_mgm')}
      {BL('betrivers', 'HR', 'BetRivers Anytime HR', 50, 'sa_br')}
      {H('M÷F', 'BetMGM÷FD implied ratio', 36, 'm_div_f')}
      {H('HR/ML', 'FanDuel Home Run/Moneyline Parlay price', 44, 'hrMl_fd')}
      {H('HR÷Parlay', 'Anytime HR ÷ HR/Moneyline Parlay ratio', 36, 'sa_div_ml')}
      {H('Laser', 'Laser market price', 50, 'laser105_fd')}
      {H('Moon', 'Moonshot market price', 50, 'moonshot_fd')}
      {H('1stPA', '1st Plate Appearance HR price', 50, 'pa1_fd')}
      {H('PA÷HR', '1st Plate Appearance HR ÷ Anytime HR ratio', 36, 'pa1_div_sa')}
      {H('HR÷RBI', 'Anytime HR÷RBI implied (FD)', 38, 'sa_div_rbi', 'pkRbi')}
      {H('HR÷RBI2', 'Anytime HR÷2+RBI implied (FD)', 40, 'sa_div_rbi2')}
      {H('HR÷RBI3', 'Anytime HR÷3+RBI implied (FD)', 40, 'sa_div_rbi3')}
      {H('HR÷HRR', 'Anytime HR÷Hits+Runs+RBIs implied (FD)', 40, 'sa_div_hrr', 'pkHrr')}
      {H('HR÷TB', 'Anytime HR÷2+ total bases implied (FD)', 40, 'sa_div_tb', 'pkTb')}
      {H('HR÷TB3', 'Anytime HR÷3+ total bases implied (FD)', 40, 'sa_div_tb3')}
      {H('HR÷TB4', 'Anytime HR÷4+ total bases implied (FD)', 40, 'sa_div_tb4')}
      {H('HR÷TB5', 'Anytime HR÷5+ total bases implied (FD)', 40, 'sa_div_tb5')}
      {H('HR÷2HR', 'Anytime HR÷2+ HR implied (FD)', 40, 'sa_div_hr2')}
      <th style={SDIV_H} />
      {BL('fanduel', 'SNG', 'Singles (FD)', 50, 'sng_fd', 'pkSingles')}
      {BL('fanduel', 'DBL', 'Doubles (FD)', 50, 'dbl_fd', 'pkDoubles')}
      {BL('fanduel', 'TRI', 'Triples (FD)', 50, 'tri_fd', 'pkTriples')}
      {BL('fanduel', 'SB', 'Stolen Base (FD)', 44, 'sb_fd', 'pkStolenBases')}
      {BL('fanduel', 'SB2', '2+ Stolen Bases (FD)', 44, 'sb2_fd')}
      {BL('fanduel', 'HIT', '1+ Hit (FD)', 44, 'hits_fd', 'pkHits')}
      {BL('fanduel', 'HIT2', '2+ Hits (FD)', 44, 'hits2_fd')}
      {BL('fanduel', 'RUN', '1+ Run Scored (FD)', 44, 'runs_fd', 'pkRuns')}
      {BL('fanduel', 'RUN2', '2+ Runs Scored (FD)', 44, 'runs2_fd')}
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
    </>
  )

  return (
    <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8 }}>
      <table className="dugout-dense-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10, width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>{headerCells}</tr>
        </thead>
        <tbody>
          {/* Home */}
          <tr>
            <td colSpan={99} style={{ background: 'var(--surface-2)', padding: '7px 8px', borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamLogo abbr={game.homeAbbr} size={22} />
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-1)' }}>{game.homeTeam}</span>
                {!game.homeLineupConfirmed && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                    {game.homeLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
                  </span>
                )}
                {game.awayPitcher && <PitcherLinkChip pitcher={game.awayPitcher} teamAbbr={game.awayAbbr} date={date} />}
                <Tooltip content={stickyMode
                  ? 'Sticky Columns is ON — click any column header to add it to the sort chain (rank 1 = primary). Click an active column again to flip its direction, once more to drop it.'
                  : 'Turn on to build a multi-column sort — e.g. most picks, then highest SB, then lowest HR — instead of one column replacing the last.'}
                >
                  <button
                    onClick={() => setStickyMode(v => !v)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4,
                      padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${stickyMode ? 'var(--accent)' : 'var(--border)'}`,
                      background: stickyMode ? 'rgba(180,255,77,0.12)' : 'var(--surface)',
                      color: stickyMode ? 'var(--accent)' : 'var(--text-2)',
                    }}
                  >
                    📌 Sticky Columns{stickyMode && stickyCols.length > 0 ? ` (${stickyCols.length})` : ''}
                  </button>
                </Tooltip>
                {stickyMode && stickyCols.length > 0 && (
                  <Tooltip content="Clear the sticky sort chain">
                    <button
                      onClick={() => setStickyCols([])}
                      style={{ padding: '3px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)' }}
                    >
                      ✕ Clear
                    </button>
                  </Tooltip>
                )}
              </div>
            </td>
          </tr>
          {displayHome.map((row: BatterRow) => {
            const key = `h-${row.mlb_id ?? row.name}`
            return (
              <React.Fragment key={key}>
                <BatterRowEl row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)} gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined} />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} oppPitcher={game.awayPitcher} pitcherTeamAbbr={game.awayAbbr} gameInfo={gameInfo} pool={pool} /></tr>
                )}
              </React.Fragment>
            )
          })}

          {/* Away — spacer row + a visibly heavier divider than the home
              section's, so the seam between the two teams reads as a real
              break instead of the away header looking like a trailing part
              of the home team's block above it. */}
          <tr><td colSpan={99} style={{ height: 6, background: 'transparent', border: 'none', padding: 0 }} /></tr>
          <tr>
            <td colSpan={99} style={{ background: 'var(--surface-2)', padding: '7px 8px', borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)', boxShadow: '0 -4px 8px -4px rgba(0,0,0,0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TeamLogo abbr={game.awayAbbr} size={22} />
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-1)' }}>{game.awayTeam}</span>
                {!game.awayLineupConfirmed && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
                    {game.awayLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
                  </span>
                )}
                {game.homePitcher && <PitcherLinkChip pitcher={game.homePitcher} teamAbbr={game.homeAbbr} date={date} />}
              </div>
            </td>
          </tr>
          {/* Repeated column header — placed directly under the away team's
              own divider bar (not above it) so it visually belongs to the
              away section, not the tail end of the home team's block. */}
          <tr>{headerCells}</tr>
          {displayAway.map((row: BatterRow) => {
            const key = `a-${row.mlb_id ?? row.name}`
            return (
              <React.Fragment key={key}>
                <BatterRowEl row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)} gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined} />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} oppPitcher={game.homePitcher} pitcherTeamAbbr={game.homeAbbr} gameInfo={gameInfo} pool={pool} /></tr>
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
  const [showNearHrBoard, setShowNearHrBoard] = useState(false)

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
  const platoonMap = useMemo(() => buildPlatoonMap(data?.batterPlatoonSplits ?? []), [data?.batterPlatoonSplits])

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
    // A player can have one row per market (home_runs, hits, runs, singles,
    // doubles, hrr...) for the same game — keep every market's row instead
    // of collapsing them down to one, or whichever market wins the collapse
    // silently gets displayed/labeled as if it were the others (e.g. an
    // hrr-only row rendered under the "HR" column and tooltip).
    //
    // Also scoped to the ACTIVE game's own gameKey — a doubleheader's two
    // legs share every player between them, and pikkit_public_picks now
    // carries a real per-leg game_key (see the admin importer), so a row
    // stamped for the other leg must not leak into this one. Rows imported
    // before that fix (or via any other path) have game_key = '' and are
    // still shown — same best-effort behavior as before this fix, just no
    // longer able to CLOBBER a properly-tagged row for the other leg.
    const activeGameKey = (data?.games ?? []).find((g: any) => g.gameKey === activeGame)?.gameKey
      ?? (data?.games ?? [])[0]?.gameKey ?? null
    const m: Record<string, Record<string, any>> = {}
    for (const r of (data?.pikkit ?? [])) {
      if (r.game_key && activeGameKey && r.game_key !== activeGameKey) continue
      const nn = normName(r.player_name || '')
      const market = r.prop_type || r.market
      if (!nn || !market) continue
      if (!m[nn]) m[nn] = {}
      const existing = m[nn][market]
      // A row explicitly tagged for THIS game always wins over a legacy/
      // untagged ('') row for the same player+market, regardless of which
      // one the API happened to return last — otherwise a pre-fix import
      // for the OTHER leg of today's doubleheader can still win this
      // overwrite and bleed onto this game exactly like before the fix.
      if (!existing || (r.game_key && r.game_key === activeGameKey && !existing.game_key)) {
        m[nn][market] = r
      }
    }
    return m
  }, [data?.pikkit, data?.games, activeGame])

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
  const nearHrCount = data.nearHr?.length ?? 0

  return (
    <div>
      {!hasStats && (
        <div style={{ padding: '6px 12px', marginBottom: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 11, color: '#f87171' }}>
          ⚠ Statcast unavailable — mlb-party Supabase anon key may not have read access (RLS). Odds from BDL still load normally.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

        {nearHrCount > 0 && (
          <button onClick={() => setShowNearHrBoard(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '7px 14px', borderRadius: 999,
            border: '1px solid rgba(251,146,60,0.35)', background: 'rgba(251,146,60,0.1)', color: '#fb923c',
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            😮 Today's Near Home Runs
            <span style={{ background: 'rgba(251,146,60,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{nearHrCount}</span>
          </button>
        )}
      </div>

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
                  {/* No explicit timeZone — this game-tab time chip should read in whichever timezone the viewer's own browser is set to, not a hardcoded Eastern label */}
                  {new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
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
          platoonMap={platoonMap}
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

      {showNearHrBoard && (
        <NearHrLeaderboard
          nearHrs={data.nearHr ?? []}
          teamByMlbId={teamByMlbId}
          onJumpToGame={gk => { setActive(gk); setShowNearHrBoard(false) }}
          onClose={() => setShowNearHrBoard(false)}
        />
      )}

      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        /* Direct-child combinators only — the expanded drilldown row's own
           <td colSpan={99}> is a direct child of this table's tbody, but the
           nested pitch-mix/matchup tables inside it are many levels further
           down, not direct children, so their own heat-mapped cell colors
           survive hovering instead of getting flattened to this grey. */
        /* :not(.dg-sticky-col) — the sticky player-name column handles its
           own hover tint via JS state (see the hovered local state in
           BatterRowEl) instead of this rule, since a CSS !important war
           here previously reintroduced the exact bleed-through bug it was
           meant to fix (see BatterRowEl's comment on that state for why). */
        .dugout-dense-table > tbody > tr:hover > td:not(.dg-sticky-col){background:rgba(255,255,255,0.025)!important}
      `}</style>
    </div>
  )
}
