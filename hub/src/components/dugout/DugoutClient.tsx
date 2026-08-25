'use client'
import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { BookLogo } from '@/components/BookLogo'
import { Tooltip, type TooltipCardData } from '@/components/ui/tooltip-card'
import { useWatchlist } from '@/context/WatchlistContext'
import { PROP_META } from '@/lib/watchlist'
import { PlayerAvatar as SharedPlayerAvatar } from '@/components/sports/PlayerAvatar'
import { getTeamLogoUrl, getTeamColor, getTeamSecondaryColor } from '@slipsurge/core/mlbTeamColors'
import { mlbHeadshot, pitchColor, pitchLabel } from '@slipsurge/core/mlb-api'
import { StatTile } from '@/components/pitcher-report/MatchupTables'
import { canonicalProviderArchiveKey, normName, resolveNameEntry } from '@slipsurge/core/nameNorm'
import { WatchlistStarButton } from '@/components/shared/WatchlistStarButton'
import { MatchupPitchBreakdown, type DugoutSpraySelection } from '@/components/dugout/MatchupPitchBreakdown'
import { GameWeatherCard } from '@/components/dugout/GameWeatherCard'
import { RecentFormSplits } from '@/components/dugout/RecentFormSplits'
import { AffinityMatchupScore } from '@/components/dugout/AffinityMatchupScore'
import { buildPitcherMap, pickPitcherRow, computeMatchupEdgeScore, computePaperScores, computeMmRanks, type PitcherSplitRow } from '@/lib/dugoutPaperScore'
import { computeHitFloorReads, computeHitPitchProfile, type HitFloorStatus } from '@/lib/hitFloorModel'
import { createClient } from '@/lib/supabase/client'
import { Switch } from '@/components/ui/Switch'
import { Activity, Ban, BarChart3, BookOpen, ChevronLeft, ChevronRight, ChevronUp, Flame, Lock, MousePointerClick, Search, Settings2, Sparkles, Users, X } from 'lucide-react'
import { GameLockedUpsell } from '@/components/layout/GameLockedUpsell'
import { computeDugoutPercentValue, getDugoutPercentStyle } from '@/lib/dugoutPercentColor'
import { MechanicsScoreRing } from '@/components/ui/MechanicsScoreRing'

type DugoutMechanicsWindows = Partial<Record<'l1' | 'l3' | 'l5' | 'l10', {
  index: number
  rank: number
  confidence: number
  trend: number
}>>

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

// Pre-blends a Matrix's arbitrary member-chosen hex color onto the page's
// near-black background at a given alpha, returning a solid hex — a
// position:sticky cell MUST stay fully opaque (its whole job is masking
// columns scrolling underneath it), so a translucent rgba() tint there
// bleeds the scrolled content straight through, same real bug already
// fixed once for the hasHr row tint (see BatterRowEl's own comment on it).
function blendOnBg(hex: string, alpha: number, bg: [number, number, number] = [6, 7, 10]): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return `rgb(${bg[0]},${bg[1]},${bg[2]})`
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const blend = (fg: number, bgc: number) => Math.round(fg * alpha + bgc * (1 - alpha))
  return `rgb(${blend(r, bg[0])},${blend(g, bg[1])},${blend(b, bg[2])})`
}

// Team-banner row background — a subtle gradient blend of that team's own
// primary/secondary brand colors (reported live: the flat grey background
// didn't read as "this row belongs to this team" the way real team colors
// would) instead of the flat var(--surface-2) every team's banner used to
// share. Blended onto --surface-2 (not pure --bg) via the same blendOnBg
// helper the Matrix/Highlighter tints already use, at a low enough alpha to
// stay a background, not compete with the white text sitting on top of it.
function teamBannerGradient(abbr?: string | null): string {
  const primary = blendOnBg(getTeamColor(abbr), 0.3, [18, 21, 25])
  const secondary = blendOnBg(getTeamSecondaryColor(abbr), 0.3, [18, 21, 25])
  return `linear-gradient(90deg, ${primary}, ${secondary})`
}

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
export function buildSplitMap(rows: any[]) {
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

export function buildFhrAvgMap(data: any): Record<string, { fd?: number; cz?: number }> {
  const m: Record<string, { fd?: number; cz?: number }> = {}
  for (const r of (data?.fhrAvg ?? [])) {
    const nn = canonicalProviderArchiveKey(r.name_norm || r.player_name || '')
    if (!nn) continue
    if (!m[nn]) m[nn] = {}
    if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
  }
  return m
}

export function buildSaAvgMap(data: any): Record<string, { fd?: number; cz?: number }> {
  const m: Record<string, { fd?: number; cz?: number }> = {}
  for (const r of (data?.saAvg ?? [])) {
    const nn = canonicalProviderArchiveKey(r.name_norm || r.player_name || '')
    if (!nn) continue
    if (!m[nn]) m[nn] = {}
    if (r.bookmaker === 'fanduel') m[nn].fd = Number(r.avg_price)
    if (r.bookmaker === 'williamhill_us') m[nn].cz = Number(r.avg_price)
  }
  return m
}

// A player can have one row per market (home_runs, hits, runs, singles,
// doubles, hrr...) for the same game — keep every market's row instead
// of collapsing them down to one, or whichever market wins the collapse
// silently gets displayed/labeled as if it were the others (e.g. an
// hrr-only row rendered under the "HR" column and tooltip).
//
// Scoped to ONE game's own gameKey — a doubleheader's two legs share every
// player between them, and pikkit_public_picks carries a real per-leg
// game_key, so a row stamped for the other leg must not leak into this
// one. Rows imported before that (or via any other path) have game_key =
// '' and are still shown — best-effort, just can't CLOBBER a properly-
// tagged row for the other leg.
export function buildCommunityPicksMap(data: any, gameKey: string | null) {
  const m: Record<string, Record<string, any>> = {}
  for (const r of (data?.communityPicks ?? [])) {
    if (r.game_key && gameKey && r.game_key !== gameKey) continue
    const nn = normName(r.player_name || '')
    const market = r.prop_type || r.market
    if (!nn || !market) continue
    if (!m[nn]) m[nn] = {}
    const existing = m[nn][market]
    // A row explicitly tagged for THIS game always wins over a legacy/
    // untagged ('') row for the same player+market, regardless of which
    // one the API happened to return last.
    if (!existing || (r.game_key && r.game_key === gameKey && !existing.game_key)) {
      m[nn][market] = r
    }
  }
  return m
}

export function buildOpeningMap(data: any): Record<string, { sa_open: number | null; rbi_open: number | null }> {
  const m: Record<string, { sa_open: number | null; rbi_open: number | null }> = {}
  for (const r of (data?.openingSaRbi ?? [])) {
    const nn = normName(r.name_norm || '')
    if (nn) m[nn] = { sa_open: r.sa_open ?? null, rbi_open: r.rbi_open ?? null }
  }
  return m
}

// Live HR hits — a player can go deep more than once in a game (e.g. a
// multi-HR day), so this keeps every hit, not just one. Sorted by at-bat
// order so "1st homer" always renders before "2nd homer" in the popup.
export function buildHrMap(data: any): Record<string, any[]> {
  const m: Record<string, any[]> = {}
  for (const h of (data?.hrFeed ?? [])) {
    const nn = normName(h.name_norm || h.player_name || '')
    if (!nn) continue
    ;(m[nn] ??= []).push(h)
  }
  for (const nn in m) m[nn].sort((a, b) => (a.ab_index ?? 0) - (b.ab_index ?? 0))
  return m
}

// Near-miss HRs — prefer the biggest "would've left N parks" per player.
export function buildNearMap(data: any): Record<string, any> {
  const m: Record<string, any> = {}
  for (const n of (data?.nearHr ?? [])) {
    const nn = normName(n.batter_name || '')
    if (!nn) continue
    if (!m[nn] || (n.parks_hr_count || 0) > (m[nn].parks_hr_count || 0)) m[nn] = n
  }
  return m
}

// ─── build batter row ─────────────────────────────────────────────────────────
type SplitMap   = ReturnType<typeof buildSplitMap>
type PitcherMap = ReturnType<typeof buildPitcherMap>

export function buildBatterRow(
  player: any,
  pitcherHand: string,
  pitcherId: number | null,
  splitMap: SplitMap,
  pitcherMap: PitcherMap,
  fhrAvgMap: Record<string, { fd?: number; cz?: number }>,
  saAvgMap:  Record<string, { fd?: number; cz?: number }>,
  communityPicksMap: Record<string, any>,
  openingMap: Record<string, { sa_open: number | null; rbi_open: number | null }>,
  hrMap: Record<string, any[]>,
  nearMap: Record<string, any>,
  // Opposing pitcher's own precomputed recent-per-pitch-type-allowed data
  // (see dugoutMatchupEdgePrecompute.ts) — the batter's own side of the same
  // data lives on `player.matchupEdge` directly (attached server-side in
  // /api/dugout/data), so no separate batter-side map/lookup is needed here.
  pitcherMatchupEdge: any | null,
  // Which real recency window the Statcast section's "R"/Δ columns read —
  // 'season' is always the fixed baseline (server precomputes all 5, see
  // dugoutStatcast.ts); this just picks which precomputed window renders.
  statcastWindow: 'l1' | 'l3' | 'l5' | 'l10',
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
  const communityPickEntry  = resolveNameEntry(communityPicksMap, nn)
  const openingEntry = resolveNameEntry(openingMap, nn)
  const hrEntry       = resolveNameEntry(hrMap, nn)
  const nearEntry     = resolveNameEntry(nearMap, nn)
  // The API resolves these archive rows with the canonical MLB player ID.
  // Prefer that identity-safe value over rebuilding a name-only join in the
  // browser (two active players are both named Max Muncy).
  const fhrAvgEntry   = player.fhrAvg ?? resolveNameEntry(fhrAvgMap, nn)
  const saAvgEntry    = player.saAvg ?? resolveNameEntry(saAvgMap, nn)

  // xHR is a genuine Statcast probability MODEL (not derivable from raw
  // pitch data ourselves) — still sourced from mlb-party's season split
  // for the drilldown's own StatTile, the one field this section didn't
  // cut over (see dugoutStatcast.ts's own header comment for the full
  // in-house/model-only split this Statcast section now follows).
  const playerSplits = splitMap.byId[idKey] ?? splitMap.byName[nn] ?? resolveNameEntry(splitMap.byName, nn)
  const handSplits = playerSplits?.[pitcherHand]
    ?? playerSplits?.['R']
    ?? (playerSplits ? Object.values(playerSplits)[0] : null)
  const s_xhr = nv((handSplits as any)?.season?.xhr)

  // Everything else in the Statcast section (BSpd through HR, Timing/Miss)
  // is computed server-side from our own player_pitch_log + synced Savant
  // splits (see dugoutStatcast.ts) — "S" is always the fixed season window;
  // "R"/Δ read whichever real games-played window the member picked via
  // the Last 1/3/5/10 toggle, computed exactly (not mlb-party's calendar-
  // day approximation).
  const statSeason = player.statcast?.season ?? null
  const statRecent = player.statcast?.[statcastWindow] ?? null
  const mechanicsRecent = player.mechanics?.[statcastWindow] ?? null
  const s_spd = statSeason?.avgBatSpeed ?? null
  const r_spd = statRecent?.avgBatSpeed ?? null
  const d_spd = r_spd != null && s_spd != null ? r_spd - s_spd : null
  const s_hrd = statSeason?.hardSwingRate ?? null
  const r_hrd = statRecent?.hardSwingRate ?? null
  const d_hrd = r_hrd != null && s_hrd != null ? r_hrd - s_hrd : null
  const s_sq  = statSeason?.squaredUpPct ?? null
  const r_sq  = statRecent?.squaredUpPct ?? null
  const d_sq  = r_sq != null && s_sq != null ? r_sq - s_sq : null
  const s_bla = statSeason?.blastPct ?? null
  const r_bla = statRecent?.blastPct ?? null
  const d_bla = r_bla != null && s_bla != null ? r_bla - s_bla : null
  const s_len = statSeason?.avgSwingLength ?? null
  const r_len = statRecent?.avgSwingLength ?? null
  const d_len = r_len != null && s_len != null ? r_len - s_len : null
  const s_atk = statSeason?.avgAttackAngle ?? null
  const r_atk = statRecent?.avgAttackAngle ?? null
  const d_atk = r_atk != null && s_atk != null ? r_atk - s_atk : null
  const s_iaa = statSeason?.idealAttackAngleRate ?? null
  const r_iaa = statRecent?.idealAttackAngleRate ?? null
  const d_iaa = r_iaa != null && s_iaa != null ? r_iaa - s_iaa : null
  const s_tlt = statSeason?.avgTilt ?? null
  const r_tlt = statRecent?.avgTilt ?? null
  const d_tlt = r_tlt != null && s_tlt != null ? r_tlt - s_tlt : null
  const s_ev  = statSeason?.avgEv ?? null
  const r_ev  = statRecent?.avgEv ?? null
  const d_ev  = r_ev != null && s_ev != null ? r_ev - s_ev : null
  const s_la  = statSeason?.avgLa ?? null
  const r_la  = statRecent?.avgLa ?? null
  const d_la  = r_la != null && s_la != null ? r_la - s_la : null
  const s_brl = statSeason?.barrelPct ?? null
  // Toggle-driven recent/delta, same shape as r_spd/d_spd and r_sq/d_sq
  // above — real gap, reported live (2026-07-27): every other Bat Tracking
  // field with a season number also got an R·/Δ pair tied to the Last
  // 1/3/5/10 toggle at the top of the grid; Barrel% never did, even though
  // the underlying recent window was already being computed either way.
  const r_brl = statRecent?.barrelPct ?? null
  const d_brl = r_brl != null && s_brl != null ? r_brl - s_brl : null
  // Fixed L1/L3/L5 barrel columns — unlike r_spd/r_sq/etc above, these
  // aren't tied to the shared statcastWindow toggle. Every window is
  // already precomputed server-side (computeAllStatcastWindows), so this
  // just reads 3 more of them directly so all three are visible together.
  const l1_brl = player.statcast?.l1?.barrelPct ?? null
  const l3_brl = player.statcast?.l3?.barrelPct ?? null
  const l5_brl = player.statcast?.l5?.barrelPct ?? null
  const d1_brl = l1_brl != null && s_brl != null ? l1_brl - s_brl : null
  const d3_brl = l3_brl != null && s_brl != null ? l3_brl - s_brl : null
  const d5_brl = l5_brl != null && s_brl != null ? l5_brl - s_brl : null
  const s_hh  = statSeason?.hardHitPct ?? null
  const r_hh  = statRecent?.hardHitPct ?? null
  const d_hh  = r_hh != null && s_hh != null ? r_hh - s_hh : null
  const s_sweetspot = statSeason?.sweetSpotPct ?? null
  const r_sweetspot = statRecent?.sweetSpotPct ?? null
  const d_sweetspot = r_sweetspot != null && s_sweetspot != null ? r_sweetspot - s_sweetspot : null
  const s_pa  = statSeason?.pullAirRate ?? null
  const r_pa  = statRecent?.pullAirRate ?? null
  const d_pa  = r_pa != null && s_pa != null ? r_pa - s_pa : null
  const s_fb  = statSeason?.fbRate ?? null
  const r_fb  = statRecent?.fbRate ?? null
  const d_fb  = r_fb != null && s_fb != null ? r_fb - s_fb : null
  const s_hr  = statSeason?.hr ?? null
  const s_timing = statSeason?.onTimePct ?? null
  const r_timing = statRecent?.onTimePct ?? null
  const d_timing = r_timing != null && s_timing != null ? r_timing - s_timing : null
  const s_miss = statSeason?.missDistance ?? null
  const r_miss = statRecent?.missDistance ?? null
  const d_miss = r_miss != null && s_miss != null ? r_miss - s_miss : null

  // Switch hitters always bat opposite the pitcher's throwing hand (that's
  // the entire point of switching) — 'S' isn't itself a real hand key in
  // any of the hand-keyed lookup tables (they only ever have L/R rows), so
  // using player.bats directly here would silently miss every switch
  // hitter's actual platoon side. Use the real side they're standing on
  // for THIS specific pitcher for every hand-dependent lookup below.
  const effectiveBats = player.bats === 'S' ? (pitcherHand === 'L' ? 'R' : 'L') : (player.bats || 'R')

  const pitRow = pickPitcherRow(pitcherMap, pitcherId, effectiveBats)

  const matchup_edge = computeMatchupEdgeScore(pitcherHand, effectiveBats, pitRow, player.matchupEdge, pitcherMatchupEdge)
  const platoon_ops = player.matchupEdge?.platoonOps?.[pitcherHand] ?? null
  const hit_pitch_profile = computeHitPitchProfile(pitcherHand, effectiveBats, pitRow, player.matchupEdge, pitcherMatchupEdge)
  const hit_windows = Object.fromEntries((['l1', 'l3', 'l5', 'l10'] as const).map(window => {
    const data = player.statcast?.[window] ?? null
    return [window, {
      squaredUpPct: data?.squaredUpPct ?? null,
      sweetSpotPct: data?.sweetSpotPct ?? null,
      missDistance: data?.missDistance ?? null,
      onTimePct: data?.onTimePct ?? null,
      hardHitPct: data?.hardHitPct ?? null,
      avgEv: data?.avgEv ?? null,
    }]
  }))

  // How many real recent pitches we actually have on this guy — a proxy for
  // "does he play enough for his season rate stats to mean anything." A
  // rarely-used bench bat can post a 25% season barrel rate off 3-4 total
  // batted balls, which is noise, not signal, but a z-score has no idea
  // that's different from an everyday player's 25% off 200 batted balls.
  // Used to dampen paper score for anyone we barely have data on, in
  // computePaper below. Summed across both pitcher hands' recent buckets
  // (player.matchupEdge — see dugoutMatchupEdgePrecompute.ts) — a general
  // "how much recent playing time do we have" signal, not specific to
  // tonight's particular pitcher hand.
  const recent_pitch_count = Object.values(player.matchupEdge?.recentByPitchTypeByHand ?? {})
    .reduce((sum: number, byType: any) => sum + Object.values(byType ?? {}).reduce((s2: number, b: any) => s2 + (b?.pitches || 0), 0), 0)

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
  // Fanatics anytime-HR — real BDL coverage exists same as the other four
  // books already shown on this row, just never had its own column.
  const sa_fan     = props?.sa?.fanatics      ?? null
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
  // BetMGM's own opener now flows straight through the same unified
  // market_opening_prices table as everything else (see /api/cron/bdl-odds)
  // — sourced from BDL's live betmgm vendor price, not a separate scrape.
  const fhrCz_open     = open.fhrCz    ?? null
  const saCz_open      = open.saCz     ?? null
  // Fanatics FHR/anytime-HR and BetRivers anytime-HR — real opener data
  // existed in market_opening_prices already (reported live 2026-07-23),
  // just never mapped to a client field.
  const fhrFan_open    = open.fhrFan   ?? null
  const saBr_open      = open.saBr     ?? null
  const saFan_open     = open.saFan    ?? null
  // hits/hits2/runs/runs2/stolen_bases/stolen_bases2 had zero opening/delta
  // tracking anywhere before market_opening_prices — real data now exists
  // (confirmed live), just needed threading through to these cells.
  const hits_open      = open.hits         ?? null
  const hits2_open     = open.hits2        ?? null
  const runs_open      = open.runs         ?? null
  const runs2_open     = open.runs2        ?? null
  const sb_open        = open.stolenBases  ?? null
  const sb2_open       = open.stolenBases2 ?? null

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
  const picks_count = (communityPickEntry?.home_runs?.picks as number | undefined) ?? null
  const hit_pick_count = (communityPickEntry?.hits?.picks as number | undefined) ?? null
  const single_pick_count = (communityPickEntry?.singles?.picks as number | undefined) ?? null
  const captured_market_pick_counts = [
    'home_runs', 'hits', 'runs', 'stolen_bases', 'singles',
    'doubles', 'triples', 'rbi', 'hits_runs_rbi', 'bases',
  ].map(key => communityPickEntry?.[key]?.picks).filter((value): value is number => typeof value === 'number')
  const total_market_pick_count = captured_market_pick_counts.length
    ? captured_market_pick_counts.reduce((sum, value) => sum + value, 0)
    : null
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
    mechanics_index: (mechanicsRecent?.index ?? null) as number | null,
    mechanics_rank: (mechanicsRecent?.rank ?? null) as number | null,
    mechanics_confidence: (mechanicsRecent?.confidence ?? null) as number | null,
    mechanics_trend: (mechanicsRecent?.trend ?? null) as number | null,
    mechanics_window: statcastWindow,
    fhr_fd, fhr_cz, fhr_fan, div, fhr_div_sa,
    // Shade %: today's price vs own season-average price (negative = cheaper
    // than usual = book conviction). Ported exactly from mlb-party: FHR% only
    // compares FanDuel-to-FanDuel; HR% (SA) falls back to Caesars if FD's own
    // average is missing.
    fhr_pct: (() => {
      const avgFd = fhrAvgEntry?.fd
      return computeDugoutPercentValue(fhr_fd, avgFd ?? null)
    })(),
    sa_pct: (() => {
      const av = saAvgEntry ?? {}
      return computeDugoutPercentValue(sa_fd, av.fd ?? av.cz ?? null)
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
    sa_fd, sa_cz, sa_mgm, sa_br, sa_fan, m_div_f,
    sa_div_rbi, sa_div_rbi2, sa_div_rbi3, sa_div_tb, sa_div_tb3, sa_div_tb4, sa_div_tb5, sa_div_hr2, sa_div_hrr,
    sng_fd, dbl_fd, tri_fd, rbi_fd, rbi2_fd, rbi3_fd, tb_fd, tb3_fd, tb4_fd, tb5_fd, hr2_fd, hrr_fd, sb_fd, hits_fd, runs_fd,
    sb2_fd, hits2_fd, runs2_fd,
    laser105_fd, laser110_fd, moonshot_fd, pa1_fd, hrMl_fd, pa1_div_sa, sa_div_ml,
    fhr_open, saFd_open, hr2Fd_open, sngFd_open, dblFd_open, triFd_open, rbiFd_open, rbi2Fd_open, rbi3Fd_open, tbFd_open, tb3Fd_open, tb4Fd_open, tb5Fd_open, hrrFd_open,
    laser105_open, laser110_open, moonshot_open, pa1_open, hrMl_open, saMgm_open, hr2Mgm_open,
    fhrCz_open, saCz_open, hits_open, hits2_open, runs_open, runs2_open, sb_open, sb2_open,
    fhrFan_open, saBr_open, saFan_open,
    combo1_min, combo1_count, combo1_partners, combo2_min, combo2_count, combo2_partners, sa_div_c1, sa_div_c2,
    is_pwr, is_money_sa_rbi,
    rawProps: props ?? null,
    s_spd, s_hrd, s_sq, s_bla, s_len, s_atk, s_iaa, s_tlt,
    s_ev, s_la, s_brl, l1_brl, l3_brl, l5_brl, d1_brl, d3_brl, d5_brl, s_hh, s_sweetspot, s_pa, s_fb, s_xhr, s_hr,
    r_spd, r_sq, r_bla, r_atk, r_brl, r_hrd, r_len, r_iaa, r_tlt, r_ev, r_la, r_hh, r_sweetspot, r_pa, r_fb,
    d_spd, d_sq, d_brl, d_hrd, d_bla, d_len, d_atk, d_iaa, d_tlt, d_ev, d_la, d_hh, d_sweetspot, d_pa, d_fb,
    s_timing, r_timing, d_timing, s_miss, r_miss, d_miss,
    matchup_edge, platoon_ops, recent_pitch_count,
    hit_windows, hit_pitch_profile, hit_pick_count, single_pick_count, total_market_pick_count,
    hit_score: null as number | null,
    hit_rank: null as number | null,
    hit_status: 'NO_READ' as HitFloorStatus,
    hit_reasons: [] as string[],
    hit_warnings: [] as string[],
    // Each market (home_runs, hits, runs, stolen_bases, ...) is kept as its
    // own entry now — a player can have picks in more than one market for
    // the same game, and collapsing them into a single row (the old
    // behavior) meant whichever market won the collapse got mislabeled as
    // "HR" everywhere it rendered. `pk` stays HR-specific (matching its
    // column header); the others ride along on their own matching odds cell.
    pk:      communityPickEntry?.home_runs ?? null,
    pkHits:  communityPickEntry?.hits ?? null,
    pkRuns:  communityPickEntry?.runs ?? null,
    pkStolenBases: communityPickEntry?.stolen_bases ?? null,
    pkSingles: communityPickEntry?.singles ?? null,
    pkDoubles: communityPickEntry?.doubles ?? null,
    pkTriples: communityPickEntry?.triples ?? null,
    pkRbi:     communityPickEntry?.rbi ?? null,
    pkHrr:     communityPickEntry?.hits_runs_rbi ?? null,
    pkTb:      communityPickEntry?.bases ?? null,
    hr_hits: hrEntry    ?? [],
    near_hr: nearEntry  ?? null,
    // Every Custom Matrix this batter lit up for tonight's specific matchup
    // — evaluated server-side in /api/dugout/data (see matrixMatch.ts) so
    // the pitch-log/Savant bulk reads that back it stay shared across every
    // Ultimate member requesting the same date, not re-fetched per row here.
    // Always highest-priority-first; empty (not undefined) for non-Ultimate
    // callers and Ultimate members with nothing saved.
    matrix_matches: (player.matrixMatches ?? []) as { id: string; name: string; color: string; priority: number }[],
    paper: null as number | null,
    bk_rk: null as number | null,
    pp_rk: null as number | null,
    mm:    null as number | null,
  }
}

export type BatterRow = ReturnType<typeof buildBatterRow>

// ─── paper score ─────────────────────────────────────────────────────────────
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
// position:sticky on every header cell (STH, SDIV_H below) — the real,
// native version of what the team-banner rows also need (see the big
// comment above GameTable's bannerHeight effect): it only works because the
// table's wrapping div now genuinely scrolls vertically (a bounded
// max-height + real overflowY:'auto'), not the earlier free-flowing wrapper
// where overflow-y computed to 'auto' but never actually had anything to
// scroll — that's what silently broke position:sticky everywhere in this
// table before. Background MUST stay fully opaque (var(--bg)) so cells don't
// go transparent and let rows scroll up visibly through the header, exactly
// like the existing sticky Player column already documents for itself.
// `top` reads a CSS custom property (set on the table by GameTable, from the
// measured team-banner row height) instead of a literal 0 — the banner sits
// ABOVE the column-label row now (member-requested: the game/pitcher bar
// with Sticky/Highlighter/Eraser reads first, column labels pin directly
// beneath it), so the labels' own stuck offset has to start below the
// banner's height, not at the very top.
const STH: React.CSSProperties = {
  padding: '4px 2px', textAlign: 'center',
  fontSize: 9, fontWeight: 700, color: 'var(--text-2)',
  letterSpacing: '0.04em', textTransform: 'uppercase',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  background: 'var(--bg)', borderBottom: '2px solid var(--border)',
  fontFamily: "'SF Mono',ui-monospace,monospace",
  cursor: 'pointer', userSelect: 'none',
  position: 'sticky', top: 'var(--dugout-header-top, 0px)', zIndex: 6,
}
const STD: React.CSSProperties = {
  padding: '3px 2px', textAlign: 'center',
  fontSize: 10, color: 'var(--text-1)',
  fontFamily: "'SF Mono',ui-monospace,monospace",
  whiteSpace: 'nowrap',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}
const SNULL: React.CSSProperties = { ...STD, color: 'var(--text-3)' }
const SDIV_H: React.CSSProperties = { width: 5, minWidth: 5, padding: 0, background: 'var(--bg)', borderBottom: '2px solid var(--border)', borderRight: '1px solid var(--border)', position: 'sticky', top: 'var(--dugout-header-top, 0px)', zIndex: 6 }
const SDIV_D: React.CSSProperties = { width: 5, minWidth: 5, padding: 0, borderRight: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.04)' }

type SortState = { col: string; dir: 'desc' | 'asc' } | null
// A single sticky-mode entry — `rank` is its 1-based priority in the active
// multi-column sort chain (1 = primary key), shown as a small superscript so
// it's clear which column is breaking ties for which.
type MultiSortEntry = { col: string; dir: 'desc' | 'asc' }

function TH({
  label, title, w = 40, sticky = false, sortKey, active = false, dir, rank, onSort,
  pickSortKey, pickActive = false, pickDir, pickRank, onPickSort, 'data-col-key': dataColKey,
}: {
  label: React.ReactNode; title?: string; w?: number; sticky?: boolean
  'data-col-key'?: string
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
      data-col-key={dataColKey}
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
      className={responsiveSticky ? 'w-[140px] min-w-[140px] max-w-[140px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]' : undefined}
      style={{
        ...sthRest,
        ...(responsiveSticky ? {} : { width: w, minWidth: w, maxWidth: w }),
        // zIndex 7, above the other header cells' 6 — this is the frozen
        // corner cell (sticky top AND left at once), so it needs to paint
        // above everything else scrolling underneath it on either axis.
        ...(sticky ? { position: 'sticky', left: 0, zIndex: 7 } : {}),
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
  row, oppPitcher, pitcherTeamAbbr, gameInfo, pool, onClose,
}: {
  row: BatterRow
  oppPitcher?: any
  pitcherTeamAbbr: string
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  // Heat-maps the Bat Tracking tiles against the rest of tonight's lineups —
  // same "heat-mapped vs the rest of this lineup" convention as Pitcher
  // Report's PlayerStatcastDetail.
  pool: BatterRow[]
  onClose?: () => void
}) {
  const pitcherHand: 'R' | 'L' = oppPitcher?.hand === 'L' ? 'L' : 'R'
  const noBatSplits = !row.s_spd && !row.s_brl
  const [spraySelection, setSpraySelection] = useState<DugoutSpraySelection>({
    rows: [],
    contextLabel: 'All visible contact',
    pitchTypes: [],
  })
  const handleSpraySelection = useCallback((selection: DugoutSpraySelection) => {
    setSpraySelection(selection)
  }, [])

  return (
    <td className="dg-player-drilldown-cell" colSpan={99} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderBottom: '2px solid var(--border)' }}>
      <div className="dg-player-drilldown">
        <div className="dg-player-drilldown-head">
          <span><strong>{row.name}</strong><small>{row.team} · {row.position} · {row.bats}HB</small></span>
          {onClose && <button type="button" onClick={onClose} aria-label={`Collapse ${row.name}`}>Collapse <ChevronUp size={14} /></button>}
        </div>
      <div className="dg-player-drilldown-grid" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>

        {/* Real pitch-by-pitch matchup — genuine Statcast rows off
            player_pitch_log via batterStatsEngine.ts, the same engine and
            recency-window model Slate Breakdown's PitcherVsLineup uses.
            Replaces the old mlb-party 14-day/live-window pipeline, which
            only ever offered a fixed 14-day rolling window or a capped
            ~20-pitch event popup. */}
        {oppPitcher && row.mlb_id != null ? (
          <div className="dg-drilldown-section dg-matchup-section" style={{ minWidth: 460 }}>
            <MatchupPitchBreakdown
              batterId={row.mlb_id}
              batterName={row.name}
              batterBats={row.bats}
              batterTeamAbbr={row.team}
              pitcherId={oppPitcher.id}
              pitcherName={oppPitcher.name}
              pitcherHand={pitcherHand}
              pitcherTeamAbbr={pitcherTeamAbbr}
              onSpraySelectionChange={handleSpraySelection}
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
          <div className="dg-drilldown-section dg-tracking-section" style={{ minWidth: 320 }}>
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
              <StatTile label="BRL%" value={ppRaw(row.s_brl)} title="Barrel batted rate — season" heatStyle={heat(row.s_brl, g('s_brl'), 'hi')} />
              <StatTile label="L1·BRL" value={ppRaw(row.l1_brl)} title="Barrel rate — last 1 game played" heatStyle={heat(row.l1_brl, g('l1_brl'), 'hi')} />
              <StatTile label="ΔL1" value={dlt(row.d1_brl)} title="Last 1 − season barrel rate" heatStyle={heat(row.d1_brl, g('d1_brl'), 'hi')} />
              <StatTile label="L3·BRL" value={ppRaw(row.l3_brl)} title="Barrel rate — last 3 games played" heatStyle={heat(row.l3_brl, g('l3_brl'), 'hi')} />
              <StatTile label="ΔL3" value={dlt(row.d3_brl)} title="Last 3 − season barrel rate" heatStyle={heat(row.d3_brl, g('d3_brl'), 'hi')} />
              <StatTile label="L5·BRL" value={ppRaw(row.l5_brl)} title="Barrel rate — last 5 games played" heatStyle={heat(row.l5_brl, g('l5_brl'), 'hi')} />
              <StatTile label="ΔL5" value={dlt(row.d5_brl)} title="Last 5 − season barrel rate" heatStyle={heat(row.d5_brl, g('d5_brl'), 'hi')} />
              <StatTile label="HH%" value={ppRaw(row.s_hh)} title="Hard hit rate" heatStyle={heat(row.s_hh, g('s_hh'), 'hi')} />
              <StatTile label="SS%" value={ppRaw(row.s_sweetspot)} title="Sweet spot rate — batted balls hit 8-32° launch angle, season" heatStyle={heat(row.s_sweetspot, g('s_sweetspot'), 'hi')} />
              <StatTile label="R·SS" value={ppRaw(row.r_sweetspot)} title="Recent sweet spot rate" heatStyle={heat(row.r_sweetspot, g('r_sweetspot'), 'hi')} />
              <StatTile label="ΔSS" value={dlt(row.d_sweetspot)} title="Recent − season sweet spot rate" heatStyle={heat(row.d_sweetspot, g('d_sweetspot'), 'hi')} />
              <StatTile label="PULLAIR" value={row.s_pa != null ? `${(row.s_pa * 100).toFixed(1)}%` : '—'} title="Pull air rate" heatStyle={heat(row.s_pa, g('s_pa'), 'hi')} />
              <StatTile label="FB%" value={row.s_fb != null ? `${(row.s_fb * 100).toFixed(1)}%` : '—'} title="Flyball rate" heatStyle={heat(row.s_fb, g('s_fb'), 'hi')} />
              <StatTile label="EV" value={f1(row.s_ev)} title="Exit velocity" heatStyle={heat(row.s_ev, g('s_ev'), 'hi')} />
              <StatTile label="LA" value={f1(row.s_la)} title="Launch angle" />
              <StatTile label="XHR" value={f1(row.s_xhr)} title="Expected HR — season, vs. tonight's opposing pitcher hand only, not every game he's played" heatStyle={heat(row.s_xhr, g('s_xhr'), 'hi')} />
              <StatTile label="HR" value={row.s_hr != null ? String(Math.round(row.s_hr)) : '—'} title="HR — season, vs. tonight's opposing pitcher hand only, not every game he's played" heatStyle={heat(row.s_hr, g('s_hr'), 'hi')} />
            </div>
            {row.mlb_id != null && <RecentFormSplits batterId={row.mlb_id} pitcherHand={pitcherHand} />}
            {/* Ballpark conditions — same park-shape/wind visual as Weather
                Lab, scoped to just this game. Stacked under Bat Tracking/
                Recent Form & Splits (not a separate flex item) so it stays
                right beside the matchup arsenal column on smaller screens
                instead of wrapping below both columns and needing a scroll. */}
            {gameInfo.game_pk && gameInfo.game_date && (
              <div style={{ marginTop: 14 }}>
                <GameWeatherCard
                  gamePk={gameInfo.game_pk}
                  date={gameInfo.game_date}
                  sprayRows={spraySelection.rows}
                  playerName={row.name}
                  selectionLabel={spraySelection.contextLabel}
                />
              </div>
            )}
            {oppPitcher && row.mlb_id != null && (
              <AffinityMatchupScore
                batterId={row.mlb_id}
                batterName={row.name}
                batterTeamAbbr={row.team}
                batterBats={row.bats}
                pitcherId={oppPitcher.id}
                pitcherName={oppPitcher.name}
                pitcherTeamAbbr={pitcherTeamAbbr}
                pitcherHand={pitcherHand}
              />
            )}
          </div>
          )
        })()}
      </div>
      </div>
    </td>
  )
}

// ─── watchlist-able odds cell ─────────────────────────────────────────────────
function OddsCell({
  row, gameInfo, propKey, book, odds, style, display, badge, openOdds, pickCount, dataColKey,
}: {
  row: BatterRow
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  propKey: string
  book: string
  odds: number | null
  style: React.CSSProperties
  display?: React.ReactNode
  // Column-customization identity — see withColKey/renderDugoutColumns above
  // GameTable. Forwarded straight onto this cell's real <td> as a
  // data-col-key DOM attribute so Highlighter mode can key a saved
  // highlight to a stable column, not a raw DOM cellIndex that shifts
  // whenever a member hides/reorders a column.
  dataColKey?: string
  // onClick lets a badge (e.g. an FHR/HR achievement flag) open something
  // of its own (the HR detail popup) instead of falling through to this
  // cell's own click-to-watchlist handler below.
  badge?: { label: string; color: string; title: string; onClick?: (e: React.MouseEvent) => void }
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
    if (pickCount == null) return <td style={style} data-col-key={dataColKey}>—</td>
    return (
      <td style={style} data-col-key={dataColKey}>
        —
        <Tooltip content={`${pickCount.toLocaleString()} community ${meta?.label ?? propKey} picks`}>
          <div aria-label={`${pickCount.toLocaleString()} community picks`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2, padding: '1px 3px', borderRadius: 3, background: 'var(--accent-dim)', fontSize: 7, fontWeight: 900, color: 'var(--accent)', cursor: 'help', lineHeight: 1 }}>
            <span aria-hidden="true">P</span>{pickCount >= 1000 ? `${(pickCount / 1000).toFixed(1)}k` : pickCount}
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
  const teamLogo = getTeamLogoUrl(row.team)
  const tooltipContent: TooltipCardData = {
    kind: 'market',
    eyebrow: meta?.label ?? propKey,
    title: row.name,
    description: saved
      ? 'Saved to your watchlist. Select the price again to remove it.'
      : wl.signedIn
        ? 'Select this price to add the market to your watchlist.'
        : 'Sign in to save this market to your watchlist.',
    image: row.mlb_id ? { src: mlbHeadshot(row.mlb_id), alt: row.name } : null,
    team: teamLogo ? { logo: teamLogo, label: row.team } : null,
    book,
    metrics: [
      { label: 'Current', value: oStr(odds) },
      ...(openOdds != null ? [{ label: 'Opened', value: oStr(openOdds), tone: 'neutral' as const }] : []),
      ...(hasDelta ? [{ label: 'Move', value: odds! < openOdds! ? 'Shorter' : 'Longer', tone: odds! < openOdds! ? 'positive' as const : 'negative' as const }] : []),
      ...(pickCount != null ? [{ label: 'Picks', value: pickCount.toLocaleString() }] : []),
    ],
    footer: deltaTitle ?? `${row.position || 'Batter'} · ${row.bats || '—'}HB`,
  }

  // Wrapped in its own column flex — when this renders inside the
  // title-tooltip's row-flex container below, an unwrapped fragment would
  // lay the pick-count line out BESIDE the odds instead of under it. This
  // div is the single flex child of that outer container either way, so it
  // controls its own internal stacking regardless of which branch renders it.
  const cellContent = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
      {badge && (
        <Tooltip content={badge.title}>
          <div
            onClick={badge.onClick ? (e) => { e.stopPropagation(); badge.onClick!(e) } : undefined}
            style={{ fontSize: 6.5, fontWeight: 900, color: badge.color, letterSpacing: '0.03em', lineHeight: 1, cursor: badge.onClick ? 'pointer' : 'help' }}
          >
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
          <div aria-label={`${pickCount.toLocaleString()} community picks`} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginTop: 2, padding: '1px 3px', borderRadius: 3, background: 'var(--accent-dim)', fontSize: 7, fontWeight: 900, color: 'var(--accent)', cursor: 'help', lineHeight: 1 }}>
            <span aria-hidden="true">P</span>{pickCount >= 1000 ? `${(pickCount / 1000).toFixed(1)}k` : pickCount}
          </div>
        </Tooltip>
      )}
    </div>
  )

  return (
    <td
      onClick={handleClick}
      data-col-key={dataColKey}
      style={{
        ...style,
        cursor: wl.signedIn ? 'pointer' : style.cursor,
        position: 'relative',
        color: saved ? 'var(--accent)' : style.color,
        fontWeight: saved ? 700 : style.fontWeight,
      }}
    >
      <Tooltip content={tooltipContent} containerClassName="w-full h-full flex items-center justify-center">
        {cellContent}
      </Tooltip>
    </td>
  )
}

// ─── batter row ───────────────────────────────────────────────────────────────
export function BatterRowEl({ row, pool, expanded, onToggle, gameInfo, onShowHr, id, highlightMode, cellHighlights, onCellToggle, eraserMode, onEraseRow, visibleColumns, extraCells }: {
  row: BatterRow; pool: BatterRow[]; expanded: boolean; onToggle: () => void
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  onShowHr?: () => void
  id?: string
  // Highlighter — see the state block in GameTable for the full rationale.
  // Deliberately does NOT touch every individual <td> in this ~350-line
  // function's own rendering (that'd be a huge, risky diff across ~95 stat
  // columns) — instead a single click-capture handler on the <tr> below
  // figures out WHICH cell was clicked via its data-col-key attribute (see
  // withColKey/renderDugoutColumns above GameTable), and a layout effect
  // walks the row's real DOM children to paint/clear backgrounds by that
  // same key. Keyed by column identity rather than raw DOM cellIndex
  // specifically because column customization makes cellIndex meaningless —
  // two members with different hidden/reordered columns would otherwise
  // have the same numeric index point at two completely different stats.
  // Additive and reversible: with highlightMode off (the default), neither
  // the handler nor the effect touch anything, so every existing
  // click/heat-map behavior in this file is completely unaffected.
  highlightMode?: boolean
  cellHighlights?: Record<string, string>
  onCellToggle?: (colKey: string) => void
  // Eraser — same click-capture-on-<tr> shape as Highlighter, but whole-row
  // instead of per-cell: any click anywhere in the row (including the
  // sticky name column, unlike Highlighter — there's no per-cell state to
  // preserve here, so there's no reason to carve out an exception) just
  // toggles this ONE row's membership in GameTable's erasedIds set.
  eraserMode?: boolean
  onEraseRow?: () => void
  // This member's resolved column show/hide/order — see resolveDugoutColumns
  // above GameTable, which computes it once and passes the SAME reference
  // down to every row so the header and every row always render identically.
  visibleColumns: { key: string; group: string }[]
  // Optional trailing <td> cells appended after the normal Dugout columns —
  // used by DailyRecapTable to add its own HR Distance/EV sort columns
  // without forking this ~350-line row renderer. GameTable never passes
  // this, so its own rendering is completely unaffected.
  extraCells?: React.ReactNode
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
  const trRef = useRef<HTMLTableRowElement>(null)
  // Which column keys WE'VE personally painted a background onto — the
  // only ones this effect is ever allowed to clear. Real regression, caught
  // live: the first version cleared `background-color` on every cell with
  // no active highlight, on every render — but a heat-mapped cell's color
  // (heat()/oddsHeat() below) is ALSO just its own `background-color`, so
  // this was wiping out every heat-map cell in the whole table the instant
  // Highlighter mounted, highlight mode on or off. Tracking exactly which
  // keys we set means we only ever clear OUR OWN prior paint (when a
  // cell gets un-highlighted) and never touch a cell React itself colored.
  const highlightedIndices = useRef<Set<string>>(new Set())
  useLayoutEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const findCell = (colKey: string) => tr.querySelector(`[data-col-key="${CSS.escape(colKey)}"]`) as HTMLElement | null
    const nextHighlighted = new Set(Object.keys(cellHighlights ?? {}))
    for (const key of highlightedIndices.current) {
      if (nextHighlighted.has(key)) continue
      findCell(key)?.style.removeProperty('background-color')
    }
    for (const key of nextHighlighted) {
      const td = findCell(key)
      if (!td || td.classList.contains('dg-sticky-col')) continue
      td.style.backgroundColor = blendOnBg(cellHighlights![key], 0.35)
    }
    highlightedIndices.current = nextHighlighted
    // Cursor carries no data, so a coarser rule is fine here: show the
    // paint-mode affordance on every non-sticky cell while highlighting,
    // and only clear OUR crosshair (never some other cell's own intentional
    // cursor, e.g. the "help" cursor on the bats-hand badge) when it's off.
    for (const el of Array.from(tr.children)) {
      const td = el as HTMLElement
      if (td.classList.contains('dg-sticky-col')) continue
      if (highlightMode) td.style.cursor = 'crosshair'
      else if (td.style.cursor === 'crosshair') td.style.removeProperty('cursor')
    }
    // Eraser is whole-row (unlike Highlighter, no per-cell exception for the
    // sticky column) — a single cursor on the <tr> itself is enough, no
    // per-cell bookkeeping needed.
    tr.style.cursor = eraserMode ? 'not-allowed' : ''
  })
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
  // Custom Matrix highlight — already sorted highest-priority-first by the
  // server (see matrixMatch.ts), so the top match's color drives the row
  // tint; every match still listed in the tooltip. This is now the ONLY
  // thing that tints the row background — reported live: an HR-happened
  // row used to get the same passive green tint a genuine green-colored
  // Matrix match would, making it impossible to tell "this row is
  // highlighted because they homered" from "this row is highlighted
  // because of MY Matrix" at a glance while backtesting. HR/FHR now show
  // as their own badges under the actual FD odds cell they're about
  // instead (see the fhr/sa OddsCell calls below) — a row's background is
  // reserved entirely for an explicit member-defined Matrix match.
  const topMatrix = row.matrix_matches?.[0] ?? null

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

  // Achievement badges now sit under the actual FD odds cell they're each
  // about, not clustered on the name rail — a "did they homer, or is this
  // MY Matrix" mixup while backtesting was the whole reason for this move
  // (see topMatrix above), so each badge lives next to the market it's
  // reporting on instead of next to every other signal.
  const fhrBadge = hasFirst
    ? { label: '🥇', color: '#fde047', title: `First HR of the game${hits.length > 1 ? ` (${hits.length} HRs today)` : ''} — click for details`, onClick: () => onShowHr?.() }
    : undefined
  const saBadge = hasHr
    ? { label: hits.length > 1 ? `🔥×${hits.length}` : '🔥', color: '#fb923c', title: `${hits.length} home run${hits.length > 1 ? 's' : ''} today — click for details`, onClick: () => onShowHr?.() }
    : row.near_hr
      ? { label: '🎯', color: '#fbbf24', title: `Near-miss: ${row.near_hr.exit_velocity ?? '?'}mph / ${row.near_hr.hit_distance ?? '?'}ft — click for details`, onClick: () => onShowHr?.() }
      : undefined

  // Every actual column cell, exactly as always rendered — unchanged from
  // before this member-driven show/hide/reorder feature existed. Collected
  // into a fragment (rather than returned as the <tr>'s direct children)
  // purely so renderDugoutColumns can filter/reorder it against this
  // member's saved prefs and re-tag each surviving cell with a stable
  // data-col-key for Highlighter — see the actual `return` below, and
  // DUGOUT_COLUMN_LAYOUT/renderDugoutColumns above GameTable for why this
  // is safer than hand-maintaining two independently-ordered cell lists.
  const rowCells = (
    <>
      {/* sticky player cell — narrower on mobile (140px vs 190px) so more of
          the ~60 scrollable stat columns are visible without scrolling past
          a name column that's eating half a 375px viewport. Width/min/max
          moved out of inline style into the className since inline styles
          always beat responsive Tailwind classes for the same property. */}
      <td
        onClick={onToggle}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Open'} ${row.name} matchup details`}
        className="dg-sticky-col w-[172px] min-w-[172px] max-w-[172px] sm:w-[190px] sm:min-w-[190px] sm:max-w-[190px]"
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
          backgroundColor: expanded ? '#10160e' : topMatrix ? blendOnBg(topMatrix.color, 0.09) : 'var(--bg)',
          backgroundImage: hovered ? 'linear-gradient(rgba(255,255,255,0.025), rgba(255,255,255,0.025))' : 'none',
        }}
      >
        <div className="dg-player-cell-inner" style={{ display: 'flex', alignItems: 'flex-start', gap: 5, padding: '4px 4px' }}>
          {/* Order#/hand-circle rail — achievement badges (FHR/HR/near-miss)
              moved off this rail entirely, onto the actual FD FHR/SA odds
              cells they're each about (see the OddsCell `badge` prop calls
              below) — reported live: stacked here, they were easy to
              confuse with a genuine Matrix highlight at a glance while
              backtesting. This rail is just the batting order + hand now. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2, flexShrink: 0 }}>
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
          {row.mlb_id ? (
            <Link href={`/players/${row.mlb_id}`} onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: 'flex' }}>
              <PlayerAvatar mlbId={row.mlb_id} size={24} teamAbbr={row.team} name={row.name} />
            </Link>
          ) : (
            <PlayerAvatar mlbId={row.mlb_id} size={24} teamAbbr={row.team} name={row.name} />
          )}
          <div className="dg-player-copy" style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
            {/* Name line's width is now fixed regardless of how many flags
                are active — every badge moved off it (achievement flags to
                the rail above, signal flags to the position/hand line
                below), so a long name or a player with several flags at
                once no longer squeezes it down to almost nothing. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span className="dg-player-name" style={{ fontSize: 10, fontWeight: 700, color: expanded ? 'var(--accent)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '1 1 auto', minWidth: 32 }}>
                {row.name}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <WatchlistStarButton
                  mlbId={row.mlb_id} name={row.name} team={row.team} position={row.position} bats={row.bats}
                  gameInfo={gameInfo} odds={row.sa_fd} oddsByBook={row.rawProps?.sa as Record<string, number> | undefined}
                />
                {/* Which of this member's own Matrices lit this row up —
                    moved here (under the star, not the achievement rail
                    above) specifically so it never sits next to an HR/FHR
                    badge and reads as "did they homer or is this my
                    Matrix?" at a glance. */}
                {row.matrix_matches.length > 0 && (
                  <Tooltip content={`Matrix: ${row.matrix_matches.map(m => m.name).join(' · ')}`}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 1, cursor: 'help' }}>
                      {row.matrix_matches.slice(0, 3).map(m => (
                        <span key={m.id} style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      ))}
                    </span>
                  </Tooltip>
                )}
              </div>
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
          <span className="dg-expand-indicator" style={{ fontSize: 8, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </td>

      {/* Exact shared Research mechanics index for the selected L1/L3/L5/L10
          window. The value and 18-player rank are server-computed together;
          this cell only renders the canonical snapshot. */}
      <td style={{ ...STD, width: 52, minWidth: 52, padding: '2px 4px' }}>
        {row.mechanics_index != null ? (
          <Tooltip
            content={{
              kind: 'stat',
              eyebrow: 'SlipSurge Batter Score',
              title: `Score ${Math.round(row.mechanics_index)}`,
              description: `Ranks #${row.mechanics_rank ?? '—'} of 18 for the selected ${row.mechanics_window.toUpperCase()} window.`,
              icon: <Activity size={16} />,
            }}
            containerClassName="w-full h-full flex items-center justify-center"
          >
            <span style={{ display: 'inline-flex', cursor: 'help' }}>
              <MechanicsScoreRing score={row.mechanics_index} label="INDEX" size="small" />
            </span>
          </Tooltip>
        ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
      </td>

      <td style={SDIV_D} />

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
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="fanduel" odds={row.fhr_fd} openOdds={row.fhr_open} badge={fhrBadge} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_fd, g('fhr_fd'), '20,147,255') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="caesars" odds={row.fhr_cz} openOdds={row.fhrCz_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_cz, g('fhr_fd'), '11,64,50') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="fhr" book="fanatics" odds={row.fhr_fan} openOdds={row.fhrFan_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.fhr_fan, g('fhr_fd'), '218,25,55') }} />
      <td style={{ ...STD, width: 36, minWidth: 36, color: row.div != null ? (row.div > 0.008 ? '#4ade80' : row.div < -0.008 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {row.div != null ? (row.div >= 0 ? '+' : '') + (row.div * 100).toFixed(1) : '—'}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.fhr_div_sa, g('fhr_div_sa')) }}>{f2(row.fhr_div_sa)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...getDugoutPercentStyle(row.fhr_pct, row.fhr_delta_weighted, g('fhr_delta_weighted')) }}>{row.fhr_pct != null ? `${(row.fhr_pct * 100).toFixed(1)}%` : '—'}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...getDugoutPercentStyle(row.sa_pct, row.sa_delta, gTeam('sa_delta')) }}>{row.sa_pct  != null ? `${(row.sa_pct  * 100).toFixed(1)}%` : '—'}</td>

      <td style={SDIV_D} />

      {/* SA (anytime HR) */}
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="fanduel" odds={row.sa_fd} openOdds={row.saFd_open} badge={saBadge} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_fd, g('sa_fd'), '20,147,255') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="caesars" odds={row.sa_cz} openOdds={row.saCz_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_cz, g('sa_fd'), '11,64,50') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="betmgm" odds={row.sa_mgm} openOdds={row.saMgm_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_mgm, g('sa_fd'), '184,150,12') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="betrivers" odds={row.sa_br} openOdds={row.saBr_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_br, g('sa_fd'), '0,48,135') }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="sa" book="fanatics" odds={row.sa_fan} openOdds={row.saFan_open} style={{ ...STD, width: 50, minWidth: 50, ...oddsHeat(row.sa_fan, g('sa_fd'), '218,25,55') }} />
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.m_div_f, g('m_div_f')) }}>{f2(row.m_div_f)}</td>
      <OddsCell row={row} gameInfo={gameInfo} propKey="hrMl" book="fanduel" odds={row.hrMl_fd} openOdds={row.hrMl_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hrMl_fd, g('hrMl_fd')) }} />
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.sa_div_ml, g('sa_div_ml')) }}>{f2(row.sa_div_ml)}</td>
      <OddsCell row={row} gameInfo={gameInfo} propKey="laser105" book="fanduel" odds={row.laser105_fd} openOdds={row.laser105_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.laser105_fd, g('laser105_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="laser110" book="fanduel" odds={row.laser110_fd} openOdds={row.laser110_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.laser110_fd, g('laser110_fd')) }} />
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
      <OddsCell row={row} gameInfo={gameInfo} propKey="stolen_bases" book="fanduel" odds={row.sb_fd} openOdds={row.sb_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.sb_fd, g('sb_fd')) }} pickCount={row.pkStolenBases?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="stolen_bases2" book="fanduel" odds={row.sb2_fd} openOdds={row.sb2_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.sb2_fd, g('sb2_fd')) }} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="hits" book="fanduel" odds={row.hits_fd} openOdds={row.hits_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hits_fd, g('hits_fd')) }} pickCount={row.pkHits?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="hits2" book="fanduel" odds={row.hits2_fd} openOdds={row.hits2_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.hits2_fd, g('hits2_fd')) }} />
      <td
        aria-label={`Hit read: ${row.hit_status === 'NO_READ' ? 'no read' : row.hit_status.toLowerCase()}${row.hit_rank != null ? `, rank ${row.hit_rank}` : ''}${row.hit_score != null ? `, score ${row.hit_score.toFixed(1)}` : ''}`}
        title={row.hit_status === 'NO_READ'
          ? 'HIT • NO READ • Data incomplete'
          : `HIT • ${row.hit_status} • Rank #${row.hit_rank ?? '-'}${pool.length ? `/${pool.length}` : ''} • Score ${row.hit_score != null ? Math.round(row.hit_score) : '-'}`}
        style={{ ...STD, width: 38, minWidth: 38 }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <span aria-hidden="true" style={{
            width: 9,
            height: 9,
            borderRadius: '50%',
            flex: '0 0 9px',
            background: row.hit_status === 'QUALIFIED' ? '#4ade80' : row.hit_status === 'WATCH' ? '#facc15' : row.hit_status === 'NO_READ' ? '#71717a' : '#f87171',
            boxShadow: row.hit_status === 'QUALIFIED' ? '0 0 6px rgba(74,222,128,0.75)' : row.hit_status === 'WATCH' ? '0 0 5px rgba(250,204,21,0.55)' : 'none',
            opacity: row.hit_score == null ? 0.35 : 1,
          }} />
          <span style={{
            color: row.hit_status === 'QUALIFIED' ? '#4ade80' : row.hit_status === 'WATCH' ? '#facc15' : row.hit_status === 'PASS' ? '#f87171' : 'var(--text-3)',
            fontWeight: 850,
          }}>
            {row.hit_rank ?? '-'}
          </span>
        </span>
      </td>
      <OddsCell row={row} gameInfo={gameInfo} propKey="runs" book="fanduel" odds={row.runs_fd} openOdds={row.runs_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.runs_fd, g('runs_fd')) }} pickCount={row.pkRuns?.picks ?? null} />
      <OddsCell row={row} gameInfo={gameInfo} propKey="runs2" book="fanduel" odds={row.runs2_fd} openOdds={row.runs2_open} style={{ ...STD, width: 44, minWidth: 44, ...oddsHeat(row.runs2_fd, g('runs2_fd')) }} />

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
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_timing != null ? (row.d_timing > 0.01 ? '#4ade80' : row.d_timing < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_timing, 100)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_miss, g('s_miss'), 'lo') }}>{f1(row.s_miss)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_miss, g('r_miss'), 'lo') }}>{f1(row.r_miss)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_miss != null ? (row.d_miss < -0.1 ? '#4ade80' : row.d_miss > 0.1 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_miss)}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_hrd, g('s_hrd')) }}>{pp(row.s_hrd)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_hrd, g('r_hrd')) }}>{pp(row.r_hrd)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_hrd != null ? (row.d_hrd > 0.01 ? '#4ade80' : row.d_hrd < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_hrd, 100)}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_sq,  g('s_sq'))  }}>{pp(row.s_sq)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_sq,  g('r_sq'))  }}>{pp(row.r_sq)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_sq != null ? (row.d_sq > 0.01 ? '#4ade80' : row.d_sq < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_sq, 100)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_bla, g('s_bla')) }}>{pp(row.s_bla)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_bla, g('r_bla')) }}>{pp(row.r_bla)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_bla != null ? (row.d_bla > 0.01 ? '#4ade80' : row.d_bla < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_bla, 100)}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_len, g('s_len'), 'lo') }}>{f1(row.s_len)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_len, g('r_len'), 'lo') }}>{f1(row.r_len)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_len != null ? (row.d_len < -0.3 ? '#4ade80' : row.d_len > 0.3 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_len)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_atk, g('s_atk')) }}>{f1(row.s_atk)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_atk, g('r_atk')) }}>{f1(row.r_atk)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_atk != null ? (row.d_atk > 2 ? '#4ade80' : row.d_atk < -2 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_atk)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_iaa, g('s_iaa')) }}>{pp(row.s_iaa)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_iaa, g('r_iaa')) }}>{pp(row.r_iaa)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_iaa != null ? (row.d_iaa > 0.01 ? '#4ade80' : row.d_iaa < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_iaa, 100)}
      </td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.s_tlt)}</td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.r_tlt)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: 'var(--text-2)' }}>{dlt(row.d_tlt)}</td>

      <td style={SDIV_D} />

      {/* Batted ball */}
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_brl, g('s_brl')) }}>{ppRaw(row.s_brl)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_brl, g('r_brl')) }}>{ppRaw(row.r_brl)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_brl != null ? (row.d_brl > 1 ? '#4ade80' : row.d_brl < -1 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_brl)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_hh,  g('s_hh'))  }}>{ppRaw(row.s_hh)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_hh,  g('r_hh'))  }}>{ppRaw(row.r_hh)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_hh != null ? (row.d_hh > 1 ? '#4ade80' : row.d_hh < -1 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_hh)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_sweetspot, g('s_sweetspot')) }}>{ppRaw(row.s_sweetspot)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_sweetspot, g('r_sweetspot')) }}>{ppRaw(row.r_sweetspot)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_sweetspot != null ? (row.d_sweetspot > 1 ? '#4ade80' : row.d_sweetspot < -1 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_sweetspot)}
      </td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.s_pa,  g('s_pa'))  }}>{pp(row.s_pa)}</td>
      <td style={{ ...STD, width: 36, minWidth: 36, ...heat(row.r_pa,  g('r_pa'))  }}>{pp(row.r_pa)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_pa != null ? (row.d_pa > 0.01 ? '#4ade80' : row.d_pa < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_pa, 100)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_fb,  g('s_fb'))  }}>{pp(row.s_fb)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_fb,  g('r_fb'))  }}>{pp(row.r_fb)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_fb != null ? (row.d_fb > 0.01 ? '#4ade80' : row.d_fb < -0.01 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_fb, 100)}
      </td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.s_ev,  g('s_ev'))  }}>{f1(row.s_ev)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, ...heat(row.r_ev,  g('r_ev'))  }}>{f1(row.r_ev)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: row.d_ev != null ? (row.d_ev > 1 ? '#4ade80' : row.d_ev < -1 ? '#f87171' : 'var(--text-2)') : 'var(--text-3)' }}>
        {dlt(row.d_ev)}
      </td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.s_la)}</td>
      <td style={{ ...STD, width: 32, minWidth: 32 }}>{f1(row.r_la)}</td>
      <td style={{ ...STD, width: 34, minWidth: 34, color: 'var(--text-2)' }}>{dlt(row.d_la)}</td>
      <td style={{ ...STD, width: 30, minWidth: 30, ...heat(row.s_hr,  g('s_hr'))  }}>
        {row.s_hr != null ? String(Math.round(row.s_hr)) : '—'}
      </td>
    </>
  )

  return (
    <tr
      id={id}
      ref={trRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClickCapture={e => {
        if (eraserMode) {
          e.preventDefault()
          e.stopPropagation()
          onEraseRow?.()
          return
        }
        if (!highlightMode) return
        const td = (e.target as HTMLElement).closest('td')
        if (!td || td.classList.contains('dg-sticky-col')) return
        const colKey = td.getAttribute('data-col-key')
        if (!colKey) return
        e.preventDefault()
        e.stopPropagation()
        onCellToggle?.(colKey)
      }}
      style={topMatrix ? { background: blendOnBg(topMatrix.color, 0.09) } : undefined}
    >
      {renderDugoutColumns(
        rowCells, visibleColumns,
        key => <td key={key} style={SDIV_D} />,
        (el, key) => withColKey(el, key),
      )}
      {extraCells}
    </tr>
  )
}

// Column-customization identity tagger for a row cell (see renderDugoutColumns
// above GameTable) — OddsCell doesn't spread arbitrary DOM attrs, so it needs
// its own dataColKey prop; every plain <td> accepts data-* natively.
function withColKey(el: React.ReactElement, key: string): React.ReactElement {
  if (el.type === OddsCell) return React.cloneElement(el as React.ReactElement<any>, { key, dataColKey: key })
  return React.cloneElement(el as React.ReactElement<any>, { key, 'data-col-key': key })
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

export function HrPopup({ row, onClose }: { row: BatterRow; onClose: () => void }) {
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
      className="dugout-modal-backdrop"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div className="dugout-mobile-sheet"
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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
    <div className="dugout-modal-backdrop" role="dialog" aria-modal="true" aria-label="Today's home runs" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dugout-mobile-sheet dugout-leaderboard-sheet" onClick={e => e.stopPropagation()} style={{ width: 520, minWidth: 'min(340px, 100%)', maxWidth: 'min(92vw, 760px)', maxHeight: '88dvh', resize: 'horizontal', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: 'rgba(74,222,128,0.1)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Today's Home Runs</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{hits.length} HR{hits.length === 1 ? '' : 's'} across the slate. Select a player to open that game.</div>
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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

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
    <div className="dugout-modal-backdrop" role="dialog" aria-modal="true" aria-label="Today's near home runs" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dugout-mobile-sheet dugout-leaderboard-sheet" onClick={e => e.stopPropagation()} style={{ width: 520, minWidth: 'min(340px, 100%)', maxWidth: 'min(92vw, 760px)', maxHeight: '88dvh', resize: 'horizontal', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', background: 'rgba(251,146,60,0.1)', backdropFilter: 'blur(8px)' }}>
          <span style={{ fontSize: 18 }}>😮</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Today's Near Home Runs</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{nearHrs.length} ball{nearHrs.length === 1 ? '' : 's'} that would've left another park. Select a player to open that game.</div>
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
    <Tooltip content={{
      kind: 'player',
      eyebrow: `${teamAbbr} probable starter`,
      title: pitcher.name,
      description: 'Open the full player profile and pitching report.',
      image: { src: mlbHeadshot(pitcher.id), alt: pitcher.name },
      metrics: [{ label: 'Throws', value: `${pitcher.hand}HP` }],
    }}>
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
const STATCAST_WINDOW_LABEL: Record<'l1' | 'l3' | 'l5' | 'l10', string> = { l1: 'Last 1', l3: 'Last 3', l5: 'Last 5', l10: 'Last 10' }

// Centered in each team's header bar (grid: left team/pitcher info, center
// this toggle, right sticky-columns controls) so it visually sits above the
// Statcast section's "R"/Δ columns it drives — one shared statcastWindow
// state (lifted to DugoutClient) behind both team sections' copies of it.
function StatcastWindowToggle({ value, onChange }: { value: 'l1' | 'l3' | 'l5' | 'l10'; onChange: (w: 'l1' | 'l3' | 'l5' | 'l10') => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: 0.4, textTransform: 'uppercase', padding: '0 6px 0 4px' }}>Statcast</span>
      {(['l1', 'l3', 'l5', 'l10'] as const).map(w => (
        <button
          key={w}
          onClick={() => onChange(w)}
          style={{
            padding: '3px 8px', borderRadius: 6, fontSize: 9, fontWeight: 800, cursor: 'pointer',
            border: `1px solid ${value === w ? 'var(--accent)' : 'transparent'}`,
            background: value === w ? 'rgba(180,255,77,0.14)' : 'transparent',
            color: value === w ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          {STATCAST_WINDOW_LABEL[w]}
        </button>
      ))}
    </div>
  )
}

// Highlighter's own small fixed palette — same swatch-picker convention
// Custom Matrix's color picker uses, trimmed to the 5 most visually
// distinct ones so no two options read as "basically the same color" from
// across a monitor at a glance.
const HL_SWATCHES = ['#B4FF4D', '#4D9EFF', '#FF4D6A', '#FFB84D', '#A855F7']

// ─── column customization ──────────────────────────────────────────────────
// Position-indexed map of every real column in headerCells/BatterRowEl's own
// JSX (defined further down, never duplicated here) — cross-checked 1:1
// against their actual child order so this file has exactly ONE place that
// knows "column N is fhr_fd, in the fhr group" instead of the header list
// and the row-cell list each separately assuming they stay in sync (the old
// COLS_BEFORE_STATCAST comment already flagged that assumption as fragile).
// `group` here is each column's fixed "home" tag — what a "hide this whole
// section" toggle keys off, and what the reorder panel shows as a label —
// but display ORDER is a fully free, flat, cross-group sort (see
// resolveDugoutColumns): a member can genuinely move any column anywhere,
// including in front of a different section's columns or splitting a
// section into two runs. renderDugoutColumns already inserts a divider on
// any adjacent group change with no contiguity assumption, so arbitrary
// interleaving renders correctly with zero special-casing.
type DugoutColSlot = { type: 'player' } | { type: 'divider' } | { type: 'col'; key: string; group: string }
const DUGOUT_COLUMN_LAYOUT: DugoutColSlot[] = [
  { type: 'player' },
  { type: 'col', key: 'mechanics_index', group: 'mechanics' },
  { type: 'divider' },
  { type: 'col', key: 'pk', group: 'picks' },
  { type: 'divider' },
  { type: 'col', key: 'fhr_fd', group: 'fhr' },
  { type: 'col', key: 'fhr_cz', group: 'fhr' },
  { type: 'col', key: 'fhr_fan', group: 'fhr' },
  { type: 'col', key: 'div', group: 'fhr' },
  { type: 'col', key: 'fhr_div_sa', group: 'fhr' },
  { type: 'col', key: 'fhr_pct', group: 'fhr' },
  { type: 'col', key: 'sa_pct', group: 'fhr' },
  { type: 'divider' },
  { type: 'col', key: 'sa_fd', group: 'hr' },
  { type: 'col', key: 'sa_cz', group: 'hr' },
  { type: 'col', key: 'sa_mgm', group: 'hr' },
  { type: 'col', key: 'sa_br', group: 'hr' },
  { type: 'col', key: 'sa_fan', group: 'hr' },
  { type: 'col', key: 'm_div_f', group: 'hr' },
  { type: 'col', key: 'hrMl_fd', group: 'hr' },
  { type: 'col', key: 'sa_div_ml', group: 'hr' },
  { type: 'col', key: 'laser105_fd', group: 'hr' },
  { type: 'col', key: 'laser110_fd', group: 'hr' },
  { type: 'col', key: 'moonshot_fd', group: 'hr' },
  { type: 'col', key: 'pa1_fd', group: 'hr' },
  { type: 'col', key: 'pa1_div_sa', group: 'hr' },
  { type: 'col', key: 'sa_div_rbi', group: 'hr' },
  { type: 'col', key: 'sa_div_rbi2', group: 'hr' },
  { type: 'col', key: 'sa_div_rbi3', group: 'hr' },
  { type: 'col', key: 'sa_div_hrr', group: 'hr' },
  { type: 'col', key: 'sa_div_tb', group: 'hr' },
  { type: 'col', key: 'sa_div_tb3', group: 'hr' },
  { type: 'col', key: 'sa_div_tb4', group: 'hr' },
  { type: 'col', key: 'sa_div_tb5', group: 'hr' },
  { type: 'col', key: 'sa_div_hr2', group: 'hr' },
  { type: 'divider' },
  { type: 'col', key: 'sng_fd', group: 'props' },
  { type: 'col', key: 'dbl_fd', group: 'props' },
  { type: 'col', key: 'tri_fd', group: 'props' },
  { type: 'col', key: 'sb_fd', group: 'props' },
  { type: 'col', key: 'sb2_fd', group: 'props' },
  { type: 'col', key: 'hits_fd', group: 'props' },
  { type: 'col', key: 'hits2_fd', group: 'props' },
  { type: 'col', key: 'hit_score', group: 'props' },
  { type: 'col', key: 'runs_fd', group: 'props' },
  { type: 'col', key: 'runs2_fd', group: 'props' },
  { type: 'divider' },
  { type: 'col', key: 'paper', group: 'ranks' },
  { type: 'col', key: 'bk_rk', group: 'ranks' },
  { type: 'col', key: 'pp_rk', group: 'ranks' },
  { type: 'col', key: 'mm', group: 'ranks' },
  { type: 'divider' },
  { type: 'col', key: 's_spd', group: 'batspeed' },
  { type: 'col', key: 'r_spd', group: 'batspeed' },
  { type: 'col', key: 'd_spd', group: 'batspeed' },
  { type: 'col', key: 's_timing', group: 'batspeed' },
  { type: 'col', key: 'r_timing', group: 'batspeed' },
  { type: 'col', key: 'd_timing', group: 'batspeed' },
  { type: 'col', key: 's_miss', group: 'batspeed' },
  { type: 'col', key: 'r_miss', group: 'batspeed' },
  { type: 'col', key: 'd_miss', group: 'batspeed' },
  { type: 'col', key: 's_hrd', group: 'batspeed' },
  { type: 'col', key: 'r_hrd', group: 'batspeed' },
  { type: 'col', key: 'd_hrd', group: 'batspeed' },
  { type: 'col', key: 's_sq', group: 'batspeed' },
  { type: 'col', key: 'r_sq', group: 'batspeed' },
  { type: 'col', key: 'd_sq', group: 'batspeed' },
  { type: 'col', key: 's_bla', group: 'batspeed' },
  { type: 'col', key: 'r_bla', group: 'batspeed' },
  { type: 'col', key: 'd_bla', group: 'batspeed' },
  { type: 'col', key: 's_len', group: 'batspeed' },
  { type: 'col', key: 'r_len', group: 'batspeed' },
  { type: 'col', key: 'd_len', group: 'batspeed' },
  { type: 'col', key: 's_atk', group: 'batspeed' },
  { type: 'col', key: 'r_atk', group: 'batspeed' },
  { type: 'col', key: 'd_atk', group: 'batspeed' },
  { type: 'col', key: 's_iaa', group: 'batspeed' },
  { type: 'col', key: 'r_iaa', group: 'batspeed' },
  { type: 'col', key: 'd_iaa', group: 'batspeed' },
  { type: 'col', key: 's_tlt', group: 'batspeed' },
  { type: 'col', key: 'r_tlt', group: 'batspeed' },
  { type: 'col', key: 'd_tlt', group: 'batspeed' },
  { type: 'divider' },
  { type: 'col', key: 's_brl', group: 'barrel' },
  { type: 'col', key: 'r_brl', group: 'barrel' },
  { type: 'col', key: 'd_brl', group: 'barrel' },
  { type: 'col', key: 's_hh', group: 'barrel' },
  { type: 'col', key: 'r_hh', group: 'barrel' },
  { type: 'col', key: 'd_hh', group: 'barrel' },
  { type: 'col', key: 's_sweetspot', group: 'barrel' },
  { type: 'col', key: 'r_sweetspot', group: 'barrel' },
  { type: 'col', key: 'd_sweetspot', group: 'barrel' },
  { type: 'col', key: 's_pa', group: 'barrel' },
  { type: 'col', key: 'r_pa', group: 'barrel' },
  { type: 'col', key: 'd_pa', group: 'barrel' },
  { type: 'col', key: 's_fb', group: 'barrel' },
  { type: 'col', key: 'r_fb', group: 'barrel' },
  { type: 'col', key: 'd_fb', group: 'barrel' },
  { type: 'col', key: 's_ev', group: 'barrel' },
  { type: 'col', key: 'r_ev', group: 'barrel' },
  { type: 'col', key: 'd_ev', group: 'barrel' },
  { type: 'col', key: 's_la', group: 'barrel' },
  { type: 'col', key: 'r_la', group: 'barrel' },
  { type: 'col', key: 'd_la', group: 'barrel' },
  { type: 'col', key: 's_hr', group: 'barrel' },
]
// Default column order and the fixed list of static "home" groups the
// customize panel's per-section hide toggles iterate over — NOT a
// constraint on display order, which is fully free (see
// resolveDugoutColumns/DUGOUT_COLUMN_LAYOUT's own comment).
const DUGOUT_GROUP_ORDER = ['mechanics', 'picks', 'fhr', 'hr', 'props', 'ranks', 'batspeed', 'barrel'] as const
const DUGOUT_ALL_COLUMNS = DUGOUT_COLUMN_LAYOUT.filter((s): s is Extract<DugoutColSlot, { type: 'col' }> => s.type === 'col')
// Human labels for the customize panel's group toggles — the terse internal
// group keys above (fhr/hr/props/...) aren't fit to show a member.
export const DUGOUT_GROUP_LABELS: Record<string, string> = {
  mechanics: 'HR Mechanics', picks: 'Community Picks', fhr: 'First HR', hr: 'HR & Related', props: 'Hits, Runs & Bases',
  ranks: 'Rank / Composite Scores', batspeed: 'Bat Tracking', barrel: 'Batted Ball (Statcast)',
}

export type DugoutColumnPrefs = {
  hiddenGroups?: string[]
  hiddenColumns?: string[]
  // Reorders WITHIN each group only — an ordered list of column keys. A key
  // from that group not present here keeps its default relative position,
  // appended after the explicitly-ordered ones, so a column added to the
  // app later never silently vanishes for someone with an old saved order.
  columnOrder?: string[]
}

// Resolves a member's prefs into the final ordered list of VISIBLE columns
// (no player, no dividers — the caller adds those back). Pure/stateless so
// GameTable (building the header once) and every BatterRowEl (building its
// own row) always derive the identical sequence from the same input,
// instead of two independently hand-maintained lists that can drift apart.
export function resolveDugoutColumns(prefs: DugoutColumnPrefs | null | undefined): { key: string; group: string }[] {
  const hiddenGroups = new Set(prefs?.hiddenGroups ?? [])
  const hiddenColumns = new Set(prefs?.hiddenColumns ?? [])
  const visible = DUGOUT_ALL_COLUMNS.filter(c => !hiddenGroups.has(c.group) && !hiddenColumns.has(c.key))
  // A column's "home" group (DUGOUT_COLUMN_LAYOUT's static tag) is fixed —
  // it's what a "hide this whole section" toggle always keys off, wherever
  // that column currently sits — but this ordering itself is a genuinely
  // flat, cross-group sort: columnOrder is the member's own complete
  // absolute position for every column, free to interleave sections however
  // they like (move MM in front of PK, drop a Statcast column between two
  // FHR-odds columns, whatever). renderDugoutColumns already inserts a
  // divider on any adjacent group change regardless of contiguity, so this
  // needs no special handling on the render side — real interleaving was
  // already supported there; only this sort (and the Statcast banner's
  // colSpan, fixed separately) assumed sections stayed contiguous blocks.
  const orderRank = new Map((prefs?.columnOrder ?? []).map((k, i) => [k, i]))
  const ordered = [...visible].sort((a, b) => {
    const ra = orderRank.has(a.key) ? orderRank.get(a.key)! : Infinity
    const rb = orderRank.has(b.key) ? orderRank.get(b.key)! : Infinity
    if (ra !== rb) return ra - rb
    return 0 // both unranked (or tied) - stable sort keeps DUGOUT_ALL_COLUMNS' default relative order
  })
  // Existing members may have a complete saved order from before this
  // column existed. Unranked additions would otherwise fall at the very end
  // of their table. Insert this new canonical field immediately before PK
  // for those older preferences; once they explicitly reorder it, preserve
  // their chosen absolute position like every other column.
  if (!(prefs?.columnOrder ?? []).includes('mechanics_index')) {
    const mechanicsIndex = ordered.findIndex(column => column.key === 'mechanics_index')
    const picksIndex = ordered.findIndex(column => column.key === 'pk')
    if (mechanicsIndex >= 0 && picksIndex >= 0) {
      const [mechanics] = ordered.splice(mechanicsIndex, 1)
      ordered.splice(ordered.findIndex(column => column.key === 'pk'), 0, mechanics)
    }
  }
  // Keep the hit read attached to the two hit-price columns for members
  // whose saved order predates it. After they move it themselves, their
  // explicit placement wins like every other customizable column.
  if (!(prefs?.columnOrder ?? []).includes('hit_score')) {
    const hitScoreIndex = ordered.findIndex(column => column.key === 'hit_score')
    const hits2Index = ordered.findIndex(column => column.key === 'hits2_fd')
    if (hitScoreIndex >= 0 && hits2Index >= 0) {
      const [hitScore] = ordered.splice(hitScoreIndex, 1)
      ordered.splice(ordered.findIndex(column => column.key === 'hits2_fd') + 1, 0, hitScore)
    }
  }
  return ordered
}

// Turns headerCells'/BatterRowEl's own unmodified JSX fragment (still the
// ONLY place that defines what a column actually renders) into the
// member's customized subset/order, re-inserting a divider at every real
// group change instead of the fixed manually-placed divider cells the JSX
// used to hardcode. `tagCell` lets the header vs. row renderer each attach
// their own extras (row cells also want a data-col-key — see withColKey).
function renderDugoutColumns(
  fragment: React.ReactNode,
  visible: { key: string; group: string }[],
  dividerFactory: (key: string) => React.ReactElement,
  tagCell: (el: React.ReactElement, colKey: string) => React.ReactElement,
): React.ReactNode[] {
  // `fragment` is always a single <>...</> element (headerCells/rowCells),
  // not an array — React.Children.toArray on a lone Fragment ELEMENT just
  // wraps it as one item (Fragments aren't auto-unwrapped by the Children
  // utilities, only by React's own renderer), so this used to always see
  // length 1 here. That silently hit the production fallback below on
  // every render, returning a 1-item array whose one element still
  // rendered correctly (React unwraps Fragments at real render time) but
  // whose *.length* (used everywhere for colSpan) was always 1 — the
  // actual root cause of the team-banner width bugs, not any CSS/sticky
  // issue. Unwrap the Fragment's real children before flattening.
  const rawChildren = React.isValidElement(fragment) && fragment.type === React.Fragment
    ? (fragment.props as { children?: React.ReactNode }).children
    : fragment
  const children = React.Children.toArray(rawChildren)
  if (children.length !== DUGOUT_COLUMN_LAYOUT.length) {
    // A column was added/removed in the JSX without updating
    // DUGOUT_COLUMN_LAYOUT above — fail loud in dev instead of silently
    // misattributing every cell after the drift to the wrong key.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Dugout column layout mismatch: expected ${DUGOUT_COLUMN_LAYOUT.length} cells, got ${children.length} — update DUGOUT_COLUMN_LAYOUT`)
    }
    return children
  }
  const byKey = new Map<string, React.ReactElement>()
  DUGOUT_COLUMN_LAYOUT.forEach((slot, i) => {
    if (slot.type === 'col') byKey.set(slot.key, children[i] as React.ReactElement)
  })
  const playerEl = children[0] as React.ReactElement // position 0 is always 'player'
  const out: React.ReactNode[] = [React.cloneElement(playerEl, { key: 'player' })]
  let lastGroup: string | null = null
  for (const { key, group } of visible) {
    if (lastGroup !== null && group !== lastGroup) out.push(dividerFactory(`div-${key}`))
    const el = byKey.get(key)
    if (el) out.push(tagCell(el, key))
    lastGroup = group
  }
  return out
}

// Human labels for the customize panel — the terse internal column keys
// above (fhr_fd, sa_div_rbi, ...) aren't fit to show a member; these mirror
// the tooltip text each column's real header (H()/BL() inside GameTable)
// already uses, so the panel reads consistently with the board itself.
const DUGOUT_COLUMN_LABELS: Record<string, string> = {
  mechanics_index: 'SlipSurge Batter Score',
  pk: 'Community HR pick count',
  fhr_fd: 'FanDuel First HR', fhr_cz: 'Caesars First HR', fhr_fan: 'Fanatics First HR',
  div: 'FD−CZ implied diff', fhr_div_sa: 'FHR ÷ Anytime HR implied',
  fhr_pct: 'FHR historical hit rate', sa_pct: 'Anytime HR historical rate',
  sa_fd: 'FanDuel Anytime HR', sa_cz: 'Caesars Anytime HR', sa_mgm: 'BetMGM Anytime HR',
  sa_br: 'BetRivers Anytime HR', sa_fan: 'Fanatics Anytime HR',
  m_div_f: 'BetMGM÷FD implied ratio', hrMl_fd: 'HR/Moneyline Parlay price',
  sa_div_ml: 'Anytime HR ÷ HR/Moneyline ratio',
  laser105_fd: 'Laser 105+ MPH HR price', laser110_fd: 'Laser 110+ MPH HR price',
  moonshot_fd: 'Moonshot market price', pa1_fd: '1st Plate Appearance HR price',
  pa1_div_sa: '1st PA HR ÷ Anytime HR ratio',
  sa_div_rbi: 'HR vs. 1+ RBI implied', sa_div_rbi2: 'HR vs. 2+ RBI implied', sa_div_rbi3: 'HR vs. 3+ RBI implied',
  sa_div_hrr: 'HR vs. Hits + Runs + RBIs implied',
  sa_div_tb: 'HR vs. 2+ total bases implied', sa_div_tb3: 'HR vs. 3+ total bases implied',
  sa_div_tb4: 'HR vs. 4+ total bases implied', sa_div_tb5: 'HR vs. 5+ total bases implied',
  sa_div_hr2: 'HR vs. 2+ home runs implied',
  sng_fd: 'To Hit a Single', dbl_fd: 'To Hit a Double', tri_fd: 'To Hit a Triple', sb_fd: '1+ Stolen Base', sb2_fd: '2+ Stolen Bases',
  hits_fd: '1+ Hit', hits2_fd: '2+ Hits', hit_score: 'Hit model indicator and rank', runs_fd: '1+ Run Scored', runs2_fd: '2+ Runs Scored',
  paper: 'Composite Statcast score', bk_rk: 'Sportsbook rank', pp_rk: 'Statcast rank', mm: 'Market vs. Statcast gap',
  s_spd: 'Season bat speed', r_spd: 'Recent bat speed', d_spd: 'Recent−season bat speed',
  s_timing: 'Season timing %', r_timing: 'Recent timing', d_timing: 'Recent−season timing',
  s_miss: 'Season miss distance', r_miss: 'Recent miss distance', d_miss: 'Recent−season miss distance',
  s_hrd: 'Hard swing rate', r_hrd: 'Recent hard swing rate', d_hrd: 'Recent−season hard swing rate',
  s_sq: 'Squared-up per swing', r_sq: 'Recent squared-up', d_sq: 'Squared-up delta',
  s_bla: 'Blast per swing', r_bla: 'Recent blast per swing', d_bla: 'Recent−season blast per swing',
  s_len: 'Swing length', r_len: 'Recent swing length', d_len: 'Recent−season swing length',
  s_atk: 'Attack angle', r_atk: 'Recent attack angle', d_atk: 'Recent−season attack angle',
  s_iaa: 'Ideal attack angle rate', r_iaa: 'Recent ideal attack angle rate', d_iaa: 'Recent−season ideal attack angle rate',
  s_tlt: 'Swing tilt', r_tlt: 'Recent swing tilt', d_tlt: 'Recent−season swing tilt',
  s_brl: 'Barrel batted rate', r_brl: 'Recent barrel rate', d_brl: 'Recent−season barrel rate',
  s_hh: 'Hard hit rate', r_hh: 'Recent hard hit rate', d_hh: 'Recent−season hard hit rate',
  s_sweetspot: 'Sweet spot rate', r_sweetspot: 'Recent sweet spot rate', d_sweetspot: 'Recent−season sweet spot rate',
  s_pa: 'Pull air rate', r_pa: 'Recent pull air rate', d_pa: 'Recent−season pull air rate',
  s_fb: 'Flyball rate', r_fb: 'Recent flyball rate', d_fb: 'Recent−season flyball rate',
  s_ev: 'Exit velocity', r_ev: 'Recent exit velocity', d_ev: 'Recent−season exit velocity',
  s_la: 'Launch angle', r_la: 'Recent launch angle', d_la: 'Recent−season launch angle',
  s_hr: 'HR (season, vs. opposing pitcher hand)',
}

// Per-account Dugout column show/hide/reorder editor. Local-only draft state
// (nothing hits the board or the DB until Save) — Cancel/backdrop-click just
// discards it. Fully free reordering: any column can move anywhere,
// including across section boundaries (move MM in front of PK, drop a
// Statcast column between two FHR-odds columns, whatever) — a column's
// `group` is just a fixed label for the "hide this whole section" toggle
// and for grouping this list visually, never a constraint on where it can
// sit. Plain move buttons (▲▼ one step, ⤒⤓ to the very top/bottom) rather
// than drag-and-drop, since there's no drag-and-drop library in this app
// and touch-drag reliability is genuinely poor on the mobile viewports
// ~90% of members are actually on — ⤒/⤓ covers the "move it 80 spots"
// case a pure up/down chain would make painfully slow.
function ColumnCustomizePanel({ prefs, onSave, onClose }: {
  prefs: DugoutColumnPrefs | null
  onSave: (next: DugoutColumnPrefs) => void
  onClose: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set(prefs?.hiddenGroups ?? []))
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set(prefs?.hiddenColumns ?? []))
  const [columnQuery, setColumnQuery] = useState('')
  // Full flat order of every column (hidden or not) — hiding/showing a
  // column mid-edit doesn't lose its last position, it's just skipped over
  // by visibleOrder below until re-shown.
  const [order, setOrder] = useState<string[]>(() => {
    const resolved = new Set(resolveDugoutColumns(prefs).map(c => c.key))
    const rest = DUGOUT_ALL_COLUMNS.map(c => c.key).filter(k => !resolved.has(k))
    return [...resolved, ...rest]
  })
  const applyPreset = (preset: 'compact' | 'markets' | 'power' | 'statcast') => {
    const presetColumns: Record<typeof preset, string[]> = {
      compact: ['mechanics_index', 'pk', 'fhr_fd', 'fhr_cz', 'div', 'sa_fd', 'sa_cz', 'paper', 'bk_rk', 'pp_rk', 'mm'],
      markets: DUGOUT_ALL_COLUMNS.filter(col => ['picks', 'fhr', 'hr', 'props', 'ranks'].includes(col.group)).map(col => col.key),
      power: ['pk', 'fhr_fd', 'sa_fd', 'laser105_fd', 'laser110_fd', 'moonshot_fd', 'paper', 'bk_rk', 'pp_rk', 'mm', 's_spd', 'r_spd', 'd_spd', 's_brl', 'r_brl', 'd_brl', 's_hh', 'r_hh', 'd_hh', 's_ev', 'r_ev', 'd_ev', 's_la', 'r_la', 'd_la', 's_hr'],
      statcast: DUGOUT_ALL_COLUMNS.filter(col => ['ranks', 'batspeed', 'barrel'].includes(col.group)).map(col => col.key),
    }
    const visible = new Set(presetColumns[preset])
    setHiddenGroups(new Set())
    setHiddenColumns(new Set(DUGOUT_ALL_COLUMNS.map(col => col.key).filter(key => !visible.has(key))))
    setOrder([...presetColumns[preset], ...DUGOUT_ALL_COLUMNS.map(col => col.key).filter(key => !visible.has(key))])
  }
  const colByKey = useMemo(() => new Map(DUGOUT_ALL_COLUMNS.map(c => [c.key, c])), [])

  const visibleOrder = useMemo(
    () => order.filter(k => {
      const col = colByKey.get(k)
      return col && !hiddenGroups.has(col.group) && !hiddenColumns.has(k)
    }),
    [order, hiddenGroups, hiddenColumns, colByKey],
  )
  // Consecutive runs of the same static group within the CURRENT order —
  // purely a display grouping (headers/pills), recomputed every render from
  // wherever things actually sit, so it never drifts from reality even
  // after a column's been moved out of its section's usual neighborhood.
  const runs = useMemo(() => {
    const result: { group: string; keys: string[] }[] = []
    for (const key of visibleOrder) {
      const group = colByKey.get(key)!.group
      const last = result[result.length - 1]
      if (last && last.group === group) last.keys.push(key)
      else result.push({ group, keys: [key] })
    }
    return result
  }, [visibleOrder, colByKey])
  // Reported live: toggling a single column's own switch off removed that
  // column's entire row — switch included — from the list above (it's built
  // from visibleOrder, which excludes anything hidden), leaving no way to
  // turn it back on short of "Reset to default." This lists everything
  // hidden one-at-a-time (not via a whole-section switch — those already
  // have their own always-visible toggles at the top of the panel) so its
  // switch stays reachable to flip back on.
  const hiddenColumnList = useMemo(() => order.filter(k => hiddenColumns.has(k)), [order, hiddenColumns])
  const searchResults = useMemo(() => {
    const query = columnQuery.trim().toLowerCase()
    if (!query) return []
    return DUGOUT_ALL_COLUMNS.filter(col =>
      (DUGOUT_COLUMN_LABELS[col.key] ?? col.key).toLowerCase().includes(query) ||
      (DUGOUT_GROUP_LABELS[col.group] ?? col.group).toLowerCase().includes(query),
    )
  }, [columnQuery])

  const setColumnVisible = (key: string, visible: boolean) => {
    const col = colByKey.get(key)
    setHiddenColumns(prev => {
      const next = new Set(prev)
      if (visible) next.delete(key); else next.add(key)
      return next
    })
    if (visible && col) {
      setHiddenGroups(prev => {
        const next = new Set(prev)
        next.delete(col.group)
        return next
      })
    }
  }

  // Splices a reordered visible-subset back into the full `order` array (in
  // whichever positions the visible items previously occupied), leaving
  // hidden columns exactly where they were.
  const applyVisibleOrder = (nextVisible: string[]) => {
    let vi = 0
    setOrder(prev => prev.map(k => (visibleOrder.includes(k) ? nextVisible[vi++] : k)))
  }
  const moveColumn = (key: string, dir: -1 | 1) => {
    const i = visibleOrder.indexOf(key)
    const j = i + dir
    if (i === -1 || j < 0 || j >= visibleOrder.length) return
    const next = [...visibleOrder]
    ;[next[i], next[j]] = [next[j], next[i]]
    applyVisibleOrder(next)
  }
  const moveColumnToEdge = (key: string, edge: 'top' | 'bottom') => {
    const rest = visibleOrder.filter(k => k !== key)
    applyVisibleOrder(edge === 'top' ? [key, ...rest] : [...rest, key])
  }
  // Swaps two ADJACENT runs' whole key-blocks — the fast "move this entire
  // section up/down" action, distinct from moving one column at a time.
  const moveRun = (runIndex: number, dir: -1 | 1) => {
    const otherIndex = runIndex + dir
    if (otherIndex < 0 || otherIndex >= runs.length) return
    const [lowIdx, highIdx] = runIndex < otherIndex ? [runIndex, otherIndex] : [otherIndex, runIndex]
    const lowRun = runs[lowIdx], highRun = runs[highIdx]
    const startPos = visibleOrder.indexOf(lowRun.keys[0])
    const next = [...visibleOrder]
    next.splice(startPos, lowRun.keys.length + highRun.keys.length, ...highRun.keys, ...lowRun.keys)
    applyVisibleOrder(next)
  }

  const save = () => onSave({
    hiddenGroups: [...hiddenGroups],
    hiddenColumns: [...hiddenColumns],
    columnOrder: order,
  })

  const moveBtnStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', color: disabled ? 'var(--text-4)' : 'var(--text-3)',
    cursor: disabled ? 'default' : 'pointer', fontSize: 10, lineHeight: 1, padding: 2,
  })

  return (
    <div className="dugout-modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="dugout-mobile-sheet dugout-columns-sheet" onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '100%', maxHeight: '90dvh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ position: 'sticky', top: 0, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: 'var(--surface)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Customize Columns</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Show, hide, and reorder the data that matters to you.</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        <div style={{ padding: '14px 16px 4px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Quick layouts</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {([['compact', 'Compact'], ['markets', 'Markets'], ['power', 'Power'], ['statcast', 'Statcast']] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => applyPreset(key)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
            ))}
          </div>
          <label style={{ position: 'relative', display: 'block', marginBottom: 14 }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
            <input
              value={columnQuery}
              onChange={event => setColumnQuery(event.target.value)}
              placeholder="Find a column"
              aria-label="Find a Dugout column"
              style={{ width: '100%', height: 34, padding: '0 10px 0 32px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 12, outline: 'none' }}
            />
          </label>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Hide a whole section</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {DUGOUT_GROUP_ORDER.map(group => (
              <label key={group} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', padding: '4px 8px', borderRadius: 6, background: 'var(--surface-2)', cursor: 'pointer' }}>
                <Switch
                  checked={!hiddenGroups.has(group)}
                  ariaLabel={`Show ${DUGOUT_GROUP_LABELS[group] ?? group} section`}
                  onChange={v => setHiddenGroups(prev => {
                    const next = new Set(prev)
                    if (v) next.delete(group); else next.add(group)
                    return next
                  })}
                />
                {DUGOUT_GROUP_LABELS[group]}
              </label>
            ))}
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {columnQuery.trim() ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4 }}>{searchResults.length} matching {searchResults.length === 1 ? 'column' : 'columns'}</div>
              {searchResults.map(col => {
                const visible = !hiddenGroups.has(col.group) && !hiddenColumns.has(col.key)
                return (
                  <div key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, background: 'var(--surface-2)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text-2)' }}>
                      {DUGOUT_COLUMN_LABELS[col.key] ?? col.key}
                      <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-4)' }}>{DUGOUT_GROUP_LABELS[col.group]}</span>
                    </span>
                    <Switch checked={visible} onChange={value => setColumnVisible(col.key, value)} ariaLabel={`Show ${DUGOUT_COLUMN_LABELS[col.key] ?? col.key} column`} />
                  </div>
                )
              })}
              {searchResults.length === 0 && (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>No columns match that search.</div>
              )}
            </div>
          ) : runs.map((run, runIndex) => (
            <div key={`${run.group}-${runIndex}`} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)' }}>{DUGOUT_GROUP_LABELS[run.group]}</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  <button disabled={runIndex === 0} onClick={() => moveRun(runIndex, -1)} title="Move this whole section up" style={moveBtnStyle(runIndex === 0)}>▲ section</button>
                  <button disabled={runIndex === runs.length - 1} onClick={() => moveRun(runIndex, 1)} title="Move this whole section down" style={moveBtnStyle(runIndex === runs.length - 1)}>▼ section</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {run.keys.map(key => {
                  const i = visibleOrder.indexOf(key)
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'var(--surface-2)' }}>
                      <div style={{ display: 'flex', gap: 0 }}>
                        <button disabled={i === 0} onClick={() => moveColumnToEdge(key, 'top')} title="Move to top" style={moveBtnStyle(i === 0)}>⤒</button>
                        <button disabled={i === 0} onClick={() => moveColumn(key, -1)} title="Move up" style={moveBtnStyle(i === 0)}>▲</button>
                        <button disabled={i === visibleOrder.length - 1} onClick={() => moveColumn(key, 1)} title="Move down" style={moveBtnStyle(i === visibleOrder.length - 1)}>▼</button>
                        <button disabled={i === visibleOrder.length - 1} onClick={() => moveColumnToEdge(key, 'bottom')} title="Move to bottom" style={moveBtnStyle(i === visibleOrder.length - 1)}>⤓</button>
                      </div>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-2)' }}>{DUGOUT_COLUMN_LABELS[key] ?? key}</span>
                      <Switch
                        checked={!hiddenColumns.has(key)}
                        ariaLabel={`Show ${DUGOUT_COLUMN_LABELS[key] ?? key} column`}
                        onChange={v => setColumnVisible(key, v)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {!columnQuery.trim() && hiddenColumnList.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', marginBottom: 6 }}>Hidden columns</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {hiddenColumnList.map(key => {
                  const col = colByKey.get(key)!
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 6, background: 'var(--surface-2)', opacity: 0.7 }}>
                      <span style={{ flex: 1, fontSize: 11, color: 'var(--text-3)' }}>
                        {DUGOUT_COLUMN_LABELS[key] ?? key}
                        <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-4)' }}>{DUGOUT_GROUP_LABELS[col.group]}</span>
                      </span>
                      <Switch
                        checked={false}
                        ariaLabel={`Show ${DUGOUT_COLUMN_LABELS[key] ?? key} column`}
                        onChange={() => setHiddenColumns(prev => {
                          const next = new Set(prev)
                          next.delete(key)
                          return next
                        })}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <button
            onClick={() => { setHiddenGroups(new Set()); setHiddenColumns(new Set()); setOrder(DUGOUT_ALL_COLUMNS.map(c => c.key)) }}
            style={{ fontSize: 11, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', background: 'none', color: 'var(--text-3)' }}
          >
            Reset to default
          </button>
          <button onClick={save} style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid var(--accent)', borderRadius: 8, padding: '7px 16px', background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// The full ~90-column Dugout header row, as its own function so any board
// that reuses the real Dugout rendering (GameTable, DailyRecapTable) gets
// the exact same columns/tooltips/sort-keys from one source instead of two
// copies silently drifting apart — see renderDugoutColumns' own comment for
// why a length-mismatch here throws in dev.
export function getDugoutHeaderCells(
  sortInfo: (key?: string) => { active?: boolean; dir?: 'desc' | 'asc'; rank?: number },
  toggleSort: (col: string) => void,
  visibleColumns: { key: string; group: string }[],
): React.ReactNode[] {
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

  const headerCells = (
    <>
      <TH data-col-key="player" label="Player / Order" title="Player and batting order" w={190} sticky sortKey="batting_order" {...sortInfo('batting_order')} onSort={toggleSort} />
      {H(
        <img
          src="/logo.png"
          alt="SlipSurge Batter Score"
          style={{ display: 'inline-block', width: 14, height: 14, objectFit: 'contain', verticalAlign: 'middle' }}
        />,
        'SlipSurge Batter Score for the selected Last 1/3/5/10 window',
        52,
        'mechanics_index',
      )}
      <th style={SDIV_H} />
      {H(<>💲<span style={{ filter: 'invert(1)' }}>👤</span></>, 'Community HR pick count', 34, 'pk')}
      <th style={SDIV_H} />
      {BL('fanduel', 'FHR', 'FanDuel First HR', 50, 'fhr_fd')}
      {BL('caesars', 'FHR', 'Caesars First HR', 50, 'fhr_cz')}
      {BL('fanatics', 'FHR', 'Fanatics First HR', 50, 'fhr_fan')}
      {H(<span style={{ filter: 'invert(1)' }}>➗</span>, 'FD−CZ implied diff ×100', 36, 'div')}
      {H('FHR÷HR', 'FHR implied ÷ Anytime HR implied', 36, 'fhr_div_sa')}
      {H('FHR%', 'FHR historical hit rate', 36, 'fhr_pct')}
      {H('HR%', 'Anytime HR historical rate', 36, 'sa_pct')}
      <th style={SDIV_H} />
      {BL('fanduel', 'HR', 'FanDuel Anytime HR', 50, 'sa_fd')}
      {BL('caesars', 'HR', 'Caesars Anytime HR', 50, 'sa_cz')}
      {BL('betmgm', 'HR', 'BetMGM Anytime HR', 50, 'sa_mgm')}
      {BL('betrivers', 'HR', 'BetRivers Anytime HR', 50, 'sa_br')}
      {BL('fanatics', 'HR', 'Fanatics Anytime HR', 50, 'sa_fan')}
      {H('M÷F', 'BetMGM÷FD implied ratio', 36, 'm_div_f')}
      {H('HR/ML', 'FanDuel Home Run/Moneyline Parlay price', 44, 'hrMl_fd')}
      {H('🏆', 'Anytime HR ÷ HR/Moneyline Parlay ratio', 36, 'sa_div_ml')}
      {H('⚡105+', 'Laser (105+ MPH Home Run) market price', 50, 'laser105_fd')}
      {H('⚡110+', 'Laser (110+ MPH Home Run) market price', 50, 'laser110_fd')}
      {H('🌙', 'Moonshot market price', 50, 'moonshot_fd')}
      {H('🥇', '1st Plate Appearance HR price', 50, 'pa1_fd')}
      {H('⏰', '1st Plate Appearance HR ÷ Anytime HR ratio', 36, 'pa1_div_sa')}
      {H('1+ RBI', 'Anytime HR divided by 1+ RBI implied probability (FanDuel)', 44, 'sa_div_rbi', 'pkRbi')}
      {H('2+ RBI', 'Anytime HR divided by 2+ RBI implied probability (FanDuel)', 44, 'sa_div_rbi2')}
      {H('3+ RBI', 'Anytime HR divided by 3+ RBI implied probability (FanDuel)', 44, 'sa_div_rbi3')}
      {H('H+R+RBI', 'Anytime HR divided by Hits + Runs + RBIs implied probability (FanDuel)', 52, 'sa_div_hrr', 'pkHrr')}
      {H('2+ TB', 'Anytime HR divided by 2+ total bases implied probability (FanDuel)', 44, 'sa_div_tb', 'pkTb')}
      {H('3+ TB', 'Anytime HR divided by 3+ total bases implied probability (FanDuel)', 44, 'sa_div_tb3')}
      {H('4+ TB', 'Anytime HR divided by 4+ total bases implied probability (FanDuel)', 44, 'sa_div_tb4')}
      {H('5+ TB', 'Anytime HR divided by 5+ total bases implied probability (FanDuel)', 44, 'sa_div_tb5')}
      {H('2+ HR', 'Anytime HR divided by 2+ home runs implied probability (FanDuel)', 44, 'sa_div_hr2')}
      <th style={SDIV_H} />
      {BL('fanduel', '1B', 'To hit a single (FanDuel)', 50, 'sng_fd', 'pkSingles')}
      {BL('fanduel', '2B', 'To hit a double (FanDuel)', 50, 'dbl_fd', 'pkDoubles')}
      {BL('fanduel', '3B', 'To hit a triple (FanDuel)', 50, 'tri_fd', 'pkTriples')}
      {BL('fanduel', '1+ SB', '1+ stolen base (FanDuel)', 50, 'sb_fd', 'pkStolenBases')}
      {BL('fanduel', '2+ SB', '2+ stolen bases (FanDuel)', 50, 'sb2_fd')}
      {BL('fanduel', '1+ H', '1+ hit (FanDuel)', 46, 'hits_fd', 'pkHits')}
      {BL('fanduel', '2+ H', '2+ hits (FanDuel)', 46, 'hits2_fd')}
      {H('HIT', '1+ hit read: green = qualified, amber = watch, red = pass, gray = no read. Number = game rank.', 38, 'hit_score')}
      {BL('fanduel', '1+ R', '1+ run scored (FanDuel)', 46, 'runs_fd', 'pkRuns')}
      {BL('fanduel', '2+ R', '2+ runs scored (FanDuel)', 46, 'runs2_fd')}
      <th style={SDIV_H} />
      {H('📊', 'Composite Statcast score', 46, 'paper')}
      {H('📚', 'Sportsbook rank (FanDuel Anytime HR)', 30, 'bk_rk')}
      {H('⚾', 'Statcast rank', 30, 'pp_rk')}
      {H('❓', 'Sportsbook rank vs. Statcast rank — how far the market is from the numbers', 30, 'mm')}
      <th style={SDIV_H} />
      {H('BSpd', 'Season bat speed', 38, 's_spd')}
      {H('R·Spd', 'Recent bat speed', 38, 'r_spd')}
      {H('ΔSpd', 'Recent−season bat speed', 34, 'd_spd')}
      {H('Time', 'Season on-time % (pitch-mix weighted)', 36, 's_timing')}
      {H('R·Time', 'Recent timing', 36, 'r_timing')}
      {H('ΔTime', 'Recent−season timing ×100', 34, 'd_timing')}
      {H('Miss', 'Season miss distance', 34, 's_miss')}
      {H('R·Miss', 'Recent miss distance', 34, 'r_miss')}
      {H('ΔMiss', 'Recent−season miss distance', 34, 'd_miss')}
      {H('HardSw', 'Hard swing rate', 36, 's_hrd')}
      {H('R·Hrd', 'Recent hard swing rate', 34, 'r_hrd')}
      {H('ΔHrd', 'Recent−season hard swing rate ×100', 34, 'd_hrd')}
      {H('Sq', 'Squared-up per swing', 36, 's_sq')}
      {H('R·Sq', 'Recent squared-up', 36, 'r_sq')}
      {H('ΔSq', 'Squared-up delta ×100', 34, 'd_sq')}
      {H('💥', 'Blast per swing', 34, 's_bla')}
      {H('R 💥', 'Recent blast per swing', 34, 'r_bla')}
      {H('Δ💥', 'Recent−season blast per swing ×100', 34, 'd_bla')}
      {H('SwLen', 'Swing length', 36, 's_len')}
      {H('R·Len', 'Recent swing length', 34, 'r_len')}
      {H('ΔLen', 'Recent−season swing length', 34, 'd_len')}
      {H('Atk°', 'Attack angle', 34, 's_atk')}
      {H('R·Atk', 'Recent attack angle', 34, 'r_atk')}
      {H('ΔAtk', 'Recent−season attack angle', 34, 'd_atk')}
      {H('IdlAA', 'Ideal attack angle rate', 34, 's_iaa')}
      {H('R·IAA', 'Recent ideal attack angle rate', 34, 'r_iaa')}
      {H('ΔIAA', 'Recent−season ideal attack angle rate ×100', 34, 'd_iaa')}
      {H('Tilt', 'Swing tilt', 32, 's_tlt')}
      {H('R·Tlt', 'Recent swing tilt', 32, 'r_tlt')}
      {H('ΔTlt', 'Recent−season swing tilt', 34, 'd_tlt')}
      <th style={SDIV_H} />
      {H('Brl%', 'Barrel batted rate', 34, 's_brl')}
      {H('R·Brl', 'Recent barrel rate', 34, 'r_brl')}
      {H('ΔBrl', 'Recent−season barrel rate', 34, 'd_brl')}
      {H('HH%', 'Hard hit rate', 34, 's_hh')}
      {H('R·HH', 'Recent hard hit rate', 34, 'r_hh')}
      {H('ΔHH', 'Recent−season hard hit rate', 34, 'd_hh')}
      {H('SS%', 'Sweet spot rate — batted balls hit 8-32° launch angle', 34, 's_sweetspot')}
      {H('R·SS', 'Recent sweet spot rate', 34, 'r_sweetspot')}
      {H('ΔSS', 'Recent−season sweet spot rate', 34, 'd_sweetspot')}
      {H('PULL%', 'Pull air rate', 36, 's_pa')}
      {H('R·Pul', 'Recent pull air rate', 34, 'r_pa')}
      {H('ΔPul', 'Recent−season pull air rate ×100', 34, 'd_pa')}
      {H('FB%', 'Flyball rate', 34, 's_fb')}
      {H('R·FB', 'Recent flyball rate', 34, 'r_fb')}
      {H('ΔFB', 'Recent−season flyball rate ×100', 34, 'd_fb')}
      {H('EV', 'Exit velocity', 34, 's_ev')}
      {H('R·EV', 'Recent exit velocity', 34, 'r_ev')}
      {H('ΔEV', 'Recent−season exit velocity', 34, 'd_ev')}
      {H('LA', 'Launch angle', 32, 's_la')}
      {H('R·LA', 'Recent launch angle', 32, 'r_la')}
      {H('ΔLA', 'Recent−season launch angle', 34, 'd_la')}
      {H('HR', 'HR — season, vs. tonight\'s opposing pitcher hand only, not every game he\'s played', 30, 's_hr')}
    </>
  )
  return renderDugoutColumns(
    headerCells, visibleColumns,
    key => <th key={key} style={SDIV_H} />,
    (el, key) => React.cloneElement(el as React.ReactElement<any>, { key, 'data-col-key': key }),
  )
}

function GameTable({ game, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, highlightMlbId, date, statcastWindow, onStatcastWindowChange, columnPrefs, density, onDensityChange }: {
  game: any
  splitMap: SplitMap; pitcherMap: PitcherMap
  fhrAvgMap: Record<string, { fd?: number; cz?: number }>
  saAvgMap:  Record<string, { fd?: number; cz?: number }>
  communityPicksMap: Record<string, any>
  openingMap: Record<string, { sa_open: number | null; rbi_open: number | null }>
  hrMap: Record<string, any[]>
  nearMap: Record<string, any>
  highlightMlbId?: number | null
  date: string
  statcastWindow: 'l1' | 'l3' | 'l5' | 'l10'
  onStatcastWindowChange: (w: 'l1' | 'l3' | 'l5' | 'l10') => void
  // This member's saved Dugout column show/hide/order — null/undefined
  // means "show everything, default order" (see resolveDugoutColumns).
  columnPrefs?: DugoutColumnPrefs | null
  density: 'compact' | 'comfortable'
  onDensityChange: (density: 'compact' | 'comfortable') => void
}) {
  const [sort, setSort] = useState<SortState>(null)
  const [tourStep, setTourStep] = useState<number | null>(null)
  // Sticky multi-column sort — when on, each header click ADDS that column
  // to the chain instead of replacing the sort outright (rank 1 = primary
  // key, rank 2 = tiebreaker, ...). Clicking a column already in the chain
  // cycles desc -> asc -> removed, so a single chain can mix directions
  // (e.g. most picks, highest SB, but LOWEST HR). Persists across toggling
  // sticky mode off/on so flipping it off to peek at a plain single sort
  // doesn't throw away the chain you built.
  const [stickyMode, setStickyMode] = useState(false)
  const [stickyCols, setStickyCols] = useState<MultiSortEntry[]>([])

  // Highlighter — a totally separate, member-driven paint tool (own click
  // mode, own color, own persistence) from the Matrix highlight tint above:
  // that one is computed server-side off a saved Matrix; this one is purely
  // "whatever the member clicked, in whatever color they picked," with zero
  // server involvement. Scoped to THIS game only (keyed by gameKey) and
  // remembered in localStorage so a refresh — or coming back to this same
  // game later — doesn't lose it; a different game starts with a clean
  // slate since GameTable itself remounts per game (key={active.gameKey}
  // at the call site), so reading localStorage once in the initializer is
  // enough — no separate reload-on-gameKey-change effect needed.
  // Storage key bumped to v2 — highlights used to be keyed by raw DOM
  // cellIndex; column customization makes that index meaningless (two
  // members with different hidden/reordered columns would have the same
  // index point at different stats), so cells are now keyed by stable
  // column key instead (see BatterRowEl/withColKey). Old v1 data is simply
  // never read again rather than migrated — Highlighter has always
  // documented itself as a purely cosmetic, per-game scratch tool ("sticks
  // around until you clear it, just for this game"), not a permanent
  // record worth writing migration logic for.
  const hlStorageKey = `dugout-highlights-v2:${game.gameKey}`
  const [highlightMode, setHighlightMode] = useState(false)
  const [activeHlColor, setActiveHlColor] = useState(HL_SWATCHES[0])
  const [cellHighlights, setCellHighlights] = useState<Record<string, Record<string, string>>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(hlStorageKey)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })
  useEffect(() => {
    try { window.localStorage.setItem(hlStorageKey, JSON.stringify(cellHighlights)) } catch { /* private-browsing quota, etc. — highlights just won't survive a refresh */ }
  }, [cellHighlights, hlStorageKey])
  const toggleCellHighlight = (rowKey: string, colKey: string) => {
    setCellHighlights(prev => {
      const rowMap = { ...(prev[rowKey] ?? {}) }
      if (rowMap[colKey] != null) delete rowMap[colKey]
      else rowMap[colKey] = activeHlColor
      const next = { ...prev, [rowKey]: rowMap }
      if (!Object.keys(rowMap).length) delete next[rowKey]
      return next
    })
  }
  const highlightCount = Object.values(cellHighlights).reduce((n, m) => n + Object.keys(m).length, 0)

  // Eraser — a member-driven "temporarily remove this guy from the board"
  // tool for narrowing a big slate down to just the few players still under
  // consideration, without touching anyone else's data or the real matchup
  // pool (matrix matching, paper scores, etc. all still compute against the
  // FULL roster — this only hides rows from THIS render). Client-side-only
  // and intentionally NOT persisted to localStorage (unlike Highlighter) —
  // an erased slate is meant to reset the moment you leave/refresh, same as
  // any other scratch-work filter; nothing here should ever look like a
  // permanent decision about a player. Same row-key shape as Highlighter's
  // own cellHighlights keys (`h-${mlb_id ?? name}` / `a-${...}`) so it's
  // guaranteed collision-safe within a game.
  const [eraserMode, setEraserMode] = useState(false)
  const [erasedIds, setErasedIds] = useState<Set<string>>(new Set())
  const toggleErased = (rowKey: string) => {
    setErasedIds(prev => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
  }

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

  // Daily and confirmed-lineup jobs normally attach all four server-side
  // windows to the main Dugout payload. This selected-game fallback covers a
  // newly announced lineup, an older date that predates the cache, or a cache
  // row invalidated by a scratch. The canonical server service still computes
  // and persists the four windows; no model math is duplicated in the client.
  const lineupMechanicsKey = [...(game.awayLineup ?? []), ...(game.homeLineup ?? [])]
    .slice(0, 18)
    .map((player: any) => Number(player.mlb_id) || 0)
    .join(':')
  const [mechanicsFallback, setMechanicsFallback] = useState<Record<number, DugoutMechanicsWindows>>({})
  useEffect(() => {
    const players = [...(game.awayLineup ?? []), ...(game.homeLineup ?? [])].slice(0, 18)
    const hasEveryWindow = players.length === 18 && players.every((player: any) =>
      player.mechanics?.l1 && player.mechanics?.l3 && player.mechanics?.l5 && player.mechanics?.l10,
    )
    if (hasEveryWindow || players.some((player: any) => !Number(player.mlb_id))) {
      setMechanicsFallback({})
      return
    }

    const controller = new AbortController()
    setMechanicsFallback({})
    const params = new URLSearchParams({ date, gamePk: String(game.gamePk), compact: '1' })
    fetch(`/api/research/mechanics?${params}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async response => response.ok ? response.json() : null)
      .then(payload => {
        if (!controller.signal.aborted && payload?.players) {
          setMechanicsFallback(payload.players as Record<number, DugoutMechanicsWindows>)
        }
      })
      .catch(() => { /* The precomputed payload remains authoritative if fallback is unavailable. */ })
    return () => controller.abort()
  }, [date, game.gamePk, lineupMechanicsKey])

  const { homeRows, awayRows, pool } = useMemo(() => {
    const ap = game.awayPitcher
    const hp = game.homePitcher
    const withMechanics = (player: any) => mechanicsFallback[player.mlb_id]
      ? { ...player, mechanics: { ...(player.mechanics ?? {}), ...mechanicsFallback[player.mlb_id] } }
      : player
    const homeRows = game.homeLineup.map((p: any) =>
      buildBatterRow(withMechanics(p), ap?.hand || 'R', ap?.id ?? null, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, ap?.matchupEdge ?? null, statcastWindow, true, !!game.homeLineupConfirmed)
    )
    const awayRows = game.awayLineup.map((p: any) =>
      buildBatterRow(withMechanics(p), hp?.hand || 'R', hp?.id ?? null, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, hp?.matchupEdge ?? null, statcastWindow, false, !!game.awayLineupConfirmed)
    )
    const pool = [...homeRows, ...awayRows]
    computePaperScores(pool)
    computeMmRanks(pool)
    computeHitFloorReads(pool, pool.length === 18 && !!game.homeLineupConfirmed && !!game.awayLineupConfirmed)
    return { homeRows, awayRows, pool }
  }, [game, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, statcastWindow, mechanicsFallback])

  // Erased rows are filtered AFTER sorting — order among survivors stays
  // exactly what it would've been with nobody erased, just with the erased
  // rows themselves missing.
  const displayHome = sortRowsMulti(homeRows, activeSortKeys).filter(row => !erasedIds.has(`h-${row.mlb_id ?? row.name}`))
  const displayAway = sortRowsMulti(awayRows, activeSortKeys).filter(row => !erasedIds.has(`a-${row.mlb_id ?? row.name}`))

  const gameInfo = { sport: 'MLB', game_pk: game.gamePk != null ? String(game.gamePk) : null, game_date: date }

  // This member's resolved column show/hide/order (null prefs = show
  // everything, default order — see resolveDugoutColumns above GameTable).
  // Computed once and reused by the header, both team-banner colSpans
  // below, and every BatterRowEl row, so all four always agree.
  const visibleDugoutColumns = useMemo(() => resolveDugoutColumns(columnPrefs), [columnPrefs])

  // Shared by both team banners (home + away both get their own copy of
  // Sticky/Highlighter/Eraser now, not just home) — icon-only labels (no more
  // "Sticky Columns"/"Highlighter"/"Eraser" text) to leave room for two full
  // copies to fit on a mobile-width banner row. Tooltips still carry the
  // full explanation, so nothing is lost, just not shown by default.
  const modeButtons = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Tooltip content={stickyMode
        ? 'Sticky Columns is ON — click any column header to add it to the sort chain (rank 1 = primary). Click an active column again to flip its direction, once more to drop it.'
        : 'Turn on to build a multi-column sort — e.g. most picks, then highest SB, then lowest HR — instead of one column replacing the last.'}
      >
        <button
          onClick={() => setStickyMode(v => !v)}
          aria-label={`Sticky column sorting ${stickyMode ? 'on' : 'off'}`}
          aria-pressed={stickyMode}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${stickyMode ? 'var(--accent)' : 'var(--border)'}`,
            background: stickyMode ? 'rgba(180,255,77,0.12)' : 'var(--surface)',
            color: stickyMode ? 'var(--accent)' : 'var(--text-2)',
          }}
        >
          📌{stickyMode && stickyCols.length > 0 ? ` ${stickyCols.length}` : ''}
        </button>
      </Tooltip>
      {stickyMode && stickyCols.length > 0 && (
        <Tooltip content="Clear the sticky sort chain">
          <button
            onClick={() => setStickyCols([])}
            aria-label="Clear sticky column sorting"
            style={{ padding: '3px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </Tooltip>
      )}
      <div style={{ position: 'relative' }}>
        <Tooltip content={highlightMode
          ? 'Highlighter is ON — click any cell to paint it with the selected color, click a painted cell again to clear it.'
          : 'Turn on to freely highlight any cell in your own color — sticks around (even across a refresh) until you toggle it off or clear it, just for this game.'}
        >
          <button
            onClick={() => setHighlightMode(v => !v)}
            aria-label={`Cell highlighter ${highlightMode ? 'on' : 'off'}`}
            aria-pressed={highlightMode}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${highlightMode ? activeHlColor : 'var(--border)'}`,
              background: highlightMode ? `${activeHlColor}22` : 'var(--surface)',
              color: highlightMode ? activeHlColor : 'var(--text-2)',
            }}
          >
            🖍️{highlightCount > 0 ? ` ${highlightCount}` : ''}
          </button>
        </Tooltip>
        {highlightMode && (
          <div
            style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            {HL_SWATCHES.map(c => (
              <button
                key={c} title={c} onClick={() => setActiveHlColor(c)}
                aria-label={`Use ${c} highlight color`}
                aria-pressed={activeHlColor === c}
                style={{
                  width: 18, height: 18, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer',
                  border: activeHlColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                }}
              />
            ))}
            {highlightCount > 0 && (
              <Tooltip content="Clear every highlight in this game">
                <button
                  onClick={() => setCellHighlights({})}
                  aria-label="Clear all cell highlights"
                  style={{ marginLeft: 2, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px', background: 'none', color: 'var(--text-3)' }}
                >
                  ✕
                </button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      <Tooltip content={eraserMode
        ? 'Eraser is ON — click a player row to temporarily remove them from this board (sort/highlight everyone else as usual). Click again to bring them back.'
        : 'Turn on to click players off the board while you narrow down who you like — purely visual, nothing is saved, and it resets the moment you leave this page.'}
      >
        <button
          onClick={() => setEraserMode(v => !v)}
          aria-label={`Player row eraser ${eraserMode ? 'on' : 'off'}`}
          aria-pressed={eraserMode}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${eraserMode ? '#f87171' : 'var(--border)'}`,
            background: eraserMode ? 'rgba(248,113,113,0.12)' : 'var(--surface)',
            color: eraserMode ? '#f87171' : 'var(--text-2)',
          }}
        >
          🧹{erasedIds.size > 0 ? ` ${erasedIds.size}` : ''}
        </button>
      </Tooltip>
      {erasedIds.size > 0 && (
        <Tooltip content="Bring every erased player back">
          <button
            onClick={() => setErasedIds(new Set())}
            aria-label="Restore all erased player rows"
            style={{ padding: '3px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)' }}
          >
            ✕
          </button>
        </Tooltip>
      )}
      <StatcastWindowToggle value={statcastWindow} onChange={onStatcastWindowChange} />
      <Tooltip content={density === 'compact' ? 'Use roomier rows and text' : 'Fit more data on screen'}>
        <button
          type="button"
          onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
          aria-label={`Use ${density === 'compact' ? 'comfortable' : 'compact'} table density`}
          style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
        >
          {density === 'compact' ? 'Compact' : 'Comfort'}
        </button>
      </Tooltip>
    </div>
  )

  // Team-info + modeButtons content for each team's banner row. Wrapped in
  // its own position:sticky;left:0 — the <td> it lives in is colSpan'd across
  // the whole (very wide, ~90-column) row so the gradient bar visually spans
  // the table regardless of horizontal scroll, but that left this actual
  // content (team name, pitcher, Sticky/Highlighter/Eraser, Statcast toggle)
  // anchored to the LEFT EDGE of that wide cell — scrolled out of view the
  // instant a member scrolled sideways to see later stat columns, exactly
  // like the member reported. Sticky-left here uses the same horizontal
  // scroll container (and the same mechanism) the Player column already
  // relies on, so it stays glued to the visible left edge no matter how far
  // right the table is scrolled.
  const bannerContent = (side: 'home' | 'away') => (
    <div
      className="dg-team-banner-content"
      style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        position: 'sticky', left: 0, width: 'fit-content',
        background: teamBannerGradient(side === 'home' ? game.homeAbbr : game.awayAbbr),
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <TeamLogo abbr={side === 'home' ? game.homeAbbr : game.awayAbbr} size={22} />
        <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-1)' }}>{side === 'home' ? game.homeTeam : game.awayTeam}</span>
        {side === 'home' && !game.homeLineupConfirmed && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
            {game.homeLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
          </span>
        )}
        {side === 'away' && !game.awayLineupConfirmed && (
          <span style={{ fontSize: 9, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 6px', borderRadius: 4 }}>
            {game.awayLineup?.[0]?.projected ? 'PROJECTED' : 'UNCONFIRMED'}
          </span>
        )}
        {side === 'home' && game.awayPitcher && <PitcherLinkChip pitcher={game.awayPitcher} teamAbbr={game.awayAbbr} date={date} />}
        {side === 'away' && game.homePitcher && <PitcherLinkChip pitcher={game.homePitcher} teamAbbr={game.homeAbbr} date={date} />}
      </div>
      {modeButtons}
    </div>
  )

  // A JS-driven `position:fixed` clone (tracking scroll, swapping banners in
  // and out) used to live here, because position:sticky on the banner <td>s
  // didn't work — confirmed live: the table's horizontal-scroll wrapper
  // (overflowX:'auto') forced its computed overflowY to 'auto' too per the
  // CSS2.1 visible/non-visible overflow-pairing rule, even though it never
  // actually overflowed vertically (unbounded height, content-sized). That
  // made the wrapper — not the page — the "nearest scrolling ancestor" any
  // sticky descendant was constrained to, and since the wrapper's own
  // scrollTop never moved, nothing inside it could ever visually stick.
  // Real fix (below, at the wrapping div and in STH/SDIV_H above): give that
  // wrapper an actual bounded max-height + genuine overflowY:'auto', so it
  // becomes a REAL scroll container the same way the sticky Player column
  // already relies on for horizontal scroll — position:sticky on the header
  // row and the banner rows now works natively, no JS needed. Only
  // remaining JS is measuring the real banner row's rendered height, so the
  // column-header row (pinned right below it, per the member's explicit
  // ordering ask — game bar first, column labels second) can sit flush
  // against its bottom edge instead of a guessed pixel value that breaks the
  // moment the banner's own content wraps to an extra line.
  const bannerRowRef = useRef<HTMLTableCellElement>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bannerHeight, setBannerHeight] = useState(0)
  const [tableViewportHeight, setTableViewportHeight] = useState<number | null>(null)
  const [horizontalState, setHorizontalState] = useState({ hasOverflow: false, canGoLeft: false, canGoRight: false, progress: 0 })
  const updateHorizontalState = useCallback(() => {
    const el = tableScrollRef.current
    if (!el) return
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth)
    setHorizontalState({
      hasOverflow: maxScroll > 2,
      canGoLeft: el.scrollLeft > 2,
      canGoRight: el.scrollLeft < maxScroll - 2,
      progress: maxScroll > 0 ? Math.min(100, Math.max(0, (el.scrollLeft / maxScroll) * 100)) : 0,
    })
  }, [])
  const scrollBoardTo = (edge: 'start' | 'end') => {
    const el = tableScrollRef.current
    if (!el) return
    el.scrollTo({ left: edge === 'start' ? 0 : el.scrollWidth, behavior: 'smooth' })
  }
  const marketSectionJumps = useMemo(() => {
    const seen = new Set<string>()
    return visibleDugoutColumns.filter(column => {
      if (seen.has(column.group)) return false
      seen.add(column.group)
      return true
    })
  }, [visibleDugoutColumns])
  const tableTourSteps = useMemo(() => {
    const visible = new Set(visibleDugoutColumns.map(column => column.key))
    return [
      { key: 'player', label: 'Player context', title: 'Start with the lineup', body: 'The frozen column keeps the player, batting order, handedness, position, and team in view while you move across the board.', icon: 'pointer' },
      { key: 'fhr_fd', label: 'Sportsbook source', title: 'Know which market you are reading', body: 'Book logos identify the source. FHR means First Home Run. HR means an Anytime Home Run.', icon: 'book' },
      { key: 'sa_fd', label: 'Price and movement', title: 'Read the current market price', body: 'The main value is American odds. A movement arrow means the price changed from its opening value. Hover to compare opening and current prices.', icon: 'market' },
      { key: 'sng_fd', label: 'Public picks', title: 'Separate price from public action', body: 'A small P badge is the public pick count for that exact market. Use the PICKS control in the header to sort by public activity.', icon: 'users' },
      { key: 'sa_div_rbi', label: 'Related markets', title: 'Compare connected markets', body: 'RBI, total-base, and Hits + Runs + RBIs columns compare their implied probability with the Anytime HR market. These are comparisons, not raw odds.', icon: 'activity' },
      { key: 'paper', label: 'Board ranks', title: 'Use rankings as orientation', body: 'Rank and composite columns help organize a crowded board. Hover a header whenever you need its exact definition.', icon: 'chart' },
      { key: 's_spd', label: 'Recent form', title: 'Compare season and recent form', body: 'S is season, R is the selected recent window, and Δ is the change from season to recent form. Change the recent window from the team toolbar.', icon: 'activity' },
      { key: 's_brl', label: 'Statcast', title: 'Finish with batted-ball context', body: 'The final section covers barrel rate, hard-hit rate, sweet spot, pull air, fly balls, exit velocity, launch angle, and related Statcast measures.', icon: 'chart' },
    ].filter(step => step.key === 'player' || visible.has(step.key))
  }, [visibleDugoutColumns])
  const scrollToMarketSection = (columnKey: string) => {
    const el = tableScrollRef.current
    if (!el) return
    const target = el.querySelector<HTMLElement>(`th[data-col-key="${columnKey}"]`)
    if (!target) return
    el.scrollTo({ left: Math.max(0, target.offsetLeft - 190), behavior: 'smooth' })
  }
  useEffect(() => {
    const el = tableScrollRef.current
    if (!el || tourStep == null || !tableTourSteps[tourStep]) return
    const key = tableTourSteps[tourStep].key
    const targets = Array.from(el.querySelectorAll<HTMLElement>(`[data-col-key="${key}"]`))
    const header = targets.find(target => target.tagName === 'TH') ?? targets[0]
    if (header && key !== 'player') el.scrollTo({ left: Math.max(0, header.offsetLeft - 190), behavior: 'smooth' })
    if (key === 'player') el.scrollTo({ left: 0, behavior: 'smooth' })
    targets.forEach(target => target.setAttribute('data-tutorial-active', 'true'))
    return () => targets.forEach(target => target.removeAttribute('data-tutorial-active'))
  }, [tableTourSteps, tourStep])
  useEffect(() => {
    if (tourStep == null) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setTourStep(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [tourStep])
  const tableScrollStorageKey = `ss:dugout-scroll:${date}:${game.gameKey}`
  const onBoardScroll = () => {
    updateHorizontalState()
    if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current)
    scrollSaveTimer.current = setTimeout(() => {
      const el = tableScrollRef.current
      if (!el) return
      try { window.localStorage.setItem(tableScrollStorageKey, JSON.stringify({ left: el.scrollLeft, top: el.scrollTop })) } catch {}
    }, 120)
  }
  useLayoutEffect(() => {
    const el = tableScrollRef.current
    if (!el) return
    try {
      const saved = JSON.parse(window.localStorage.getItem(tableScrollStorageKey) ?? 'null')
      if (saved) el.scrollTo({ left: Number(saved.left) || 0, top: Number(saved.top) || 0 })
    } catch {}
    updateHorizontalState()
    return () => { if (scrollSaveTimer.current) clearTimeout(scrollSaveTimer.current) }
  }, [tableScrollStorageKey, updateHorizontalState])
  useLayoutEffect(() => {
    const el = bannerRowRef.current
    if (!el) return
    // A plain synchronous getBoundingClientRect read, not ResizeObserver —
    // RO's callback (like requestAnimationFrame) only fires as part of the
    // browser's active rendering pipeline, so it silently never runs at all
    // in a backgrounded/non-composited tab; a direct layout read here has no
    // such dependency and reflects the real height immediately.
    const measure = () => setBannerHeight(el.getBoundingClientRect().height)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [visibleDugoutColumns])

  useLayoutEffect(() => {
    const el = tableScrollRef.current
    if (!el) return

    // Keep the horizontal scrollbar inside the visible browser viewport.
    // A viewport-only max-height ignored the controls and game summary above
    // the table, which could place the scrollbar hundreds of pixels below the
    // screen and make the final columns appear unreachable.
    const measure = () => {
      const mobileReserve = window.matchMedia('(max-width: 640px)').matches ? 92 : 12
      const available = window.innerHeight - el.getBoundingClientRect().top - mobileReserve
      setTableViewportHeight(Math.max(220, Math.floor(available)))
      updateHorizontalState()
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [game.gamePk, visibleDugoutColumns, updateHorizontalState])

  // Rendered TWICE — once directly under the home banner, once directly
  // under the away banner (no shared top-level <thead> anymore) — each copy
  // pins independently right below its own team's banner via STH/SDIV_H's
  // sticky top:var(--dugout-header-top), so whichever section a member is
  // currently scrolled through always shows ITS OWN banner+labels pinned
  // together as a pair, not one home-section thead stuck at the very top
  // regardless of which team's rows are actually in view. Column JSX itself
  // lives in getDugoutHeaderCells so this board and DailyRecapTable always
  // render the identical set of columns.
  const renderedHeaderCells = getDugoutHeaderCells(sortInfo, toggleSort, visibleDugoutColumns)
  const activeTourStep = tourStep == null ? null : tableTourSteps[tourStep]
  return (
    <div className="dugout-board-enter" style={{ minWidth: 0, marginBottom: 8, position: 'relative' }}>
      {activeSortKeys.length > 0 && (
        <div className="dugout-redundant-sort-summary" aria-label="Active table sorts" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
          <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sorted by</span>
          {activeSortKeys.map((entry, index) => (
            <button key={entry.col} type="button" onClick={() => toggleSort(entry.col)} title="Click to change or remove this sort" style={{ border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--border))', borderRadius: 999, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '3px 8px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>
              {activeSortKeys.length > 1 ? `${index + 1}. ` : ''}{DUGOUT_COLUMN_LABELS[entry.col] ?? entry.col} {entry.dir === 'desc' ? '↓' : '↑'}
            </button>
          ))}
          <button type="button" onClick={() => { setSort(null); setStickyCols([]) }} style={{ marginLeft: 'auto', border: 0, background: 'none', color: 'var(--text-3)', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>Clear</button>
        </div>
      )}
      <div className="dugout-jump-menu" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 2 }}>Jump to</span>
        {marketSectionJumps.map(section => (
          <button
            key={`${section.group}-${section.key}`}
            type="button"
            onClick={() => scrollToMarketSection(section.key)}
            style={{ border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-2)', padding: '3px 8px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}
          >
            {DUGOUT_GROUP_LABELS[section.group] ?? section.group}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTourStep(0)}
          aria-label="Start the Dugout table walkthrough"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--border))', borderRadius: 7, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '4px 8px', fontSize: 9, fontWeight: 850, cursor: 'pointer' }}
        >
          <BookOpen size={12} aria-hidden="true" /> Take the table tour
        </button>
      </div>
      {horizontalState.hasOverflow && (
        <div className="dugout-board-nav" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(72px, 1fr) auto', alignItems: 'center', gap: 10, marginBottom: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--surface)' }}>
          <button type="button" onClick={() => scrollBoardTo('start')} disabled={!horizontalState.canGoLeft} aria-label="Go to the first Dugout columns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'none', color: horizontalState.canGoLeft ? 'var(--text-2)' : 'var(--text-4)', fontSize: 10, fontWeight: 800, cursor: horizontalState.canGoLeft ? 'pointer' : 'default', padding: '3px 4px' }}>
            <ChevronLeft size={13} aria-hidden="true" /> Start
          </button>
          <div aria-label={`Board position ${Math.round(horizontalState.progress)} percent`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(horizontalState.progress)} style={{ height: 4, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(3, horizontalState.progress)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--accent), #38bdf8)', transition: 'width 100ms ease-out' }} />
          </div>
          <button type="button" onClick={() => scrollBoardTo('end')} disabled={!horizontalState.canGoRight} aria-label="Go to the last Dugout columns" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 0, background: 'none', color: horizontalState.canGoRight ? 'var(--text-2)' : 'var(--text-4)', fontSize: 10, fontWeight: 800, cursor: horizontalState.canGoRight ? 'pointer' : 'default', padding: '3px 4px' }}>
            End <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>
      )}
    <div
      ref={tableScrollRef}
      className="dugout-board-scroll"
      onScroll={onBoardScroll}
      tabIndex={0}
      role="region"
      aria-label={`${game.awayAbbr} at ${game.homeAbbr} betting table`}
      style={{
        overflow: 'auto',
        maxHeight: tableViewportHeight == null
          ? 'calc(100dvh - var(--banner-h, 0px) - var(--topbar-h) - 24px)'
          : `${tableViewportHeight}px`,
        maxWidth: '100%', minWidth: 0, overscrollBehavior: 'contain',
        scrollbarGutter: 'stable', WebkitOverflowScrolling: 'touch',
        borderRadius: 10, border: '1px solid var(--border)',
        // Read by STH/SDIV_H above, so every column-label cell's own sticky
        // top offset sits flush below whichever team's banner is currently
        // pinned (measured off the home banner td via bannerRowRef — home
        // and away banners share the exact same content/markup shape, so
        // one measurement covers both).
        ['--dugout-header-top' as string]: `${bannerHeight}px`,
      }}
    >
      <table className={`dugout-dense-table density-${density}`} style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: density === 'compact' ? 10 : 11, width: 'max-content', minWidth: '100%' }}>
        <tbody>
          {/* Home banner, THEN home's own column-label row directly beneath
              it (not a single shared <thead> above everything) — the member
              explicitly asked for the game/pitcher bar with Sticky/
              Highlighter/Eraser to read ABOVE the column labels, and for the
              away team to keep its own header copy directly under ITS OWN
              banner (this is why that copy existed before — restored here,
              not "redundant"). Each pair pins together and hands off to the
              other team's pair as you scroll from one section into the
              other, exactly like the banner-only version already did. */}
          <tr>
            {/* Mode buttons + Statcast toggle sit content-hugging right
                after the pitcher chip (not spread to the far right via
                justifyContent:'space-between') so mobile users reach them
                without scrolling right — the actual bug that made this
                layout look broken earlier was the Children.toArray/colSpan
                fix above, not this arrangement; safe now that colSpan is
                correct. position:sticky top:0 — this is the TOPMOST pinned
                element now (member-requested ordering), zIndex above the
                data rows but below the header row's own 6 only matters if
                they ever visually overlap, which they shouldn't once
                bannerHeight is measured correctly. */}
            <td
              ref={bannerRowRef}
              className="dg-team-banner"
              colSpan={renderedHeaderCells.length}
              style={{
                background: teamBannerGradient(game.homeAbbr), padding: '7px 8px',
                borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, zIndex: 5,
              }}
            >
              {bannerContent('home')}
            </td>
          </tr>
          <tr>{renderedHeaderCells}</tr>
          {displayHome.map((row: BatterRow) => {
            const key = `h-${row.mlb_id ?? row.name}`
            return (
              <React.Fragment key={key}>
                <BatterRowEl
                  row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)}
                  gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined}
                  highlightMode={highlightMode} cellHighlights={cellHighlights[key]} onCellToggle={colKey => toggleCellHighlight(key, colKey)}
                  eraserMode={eraserMode} onEraseRow={() => toggleErased(key)} visibleColumns={visibleDugoutColumns}
                />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} oppPitcher={game.awayPitcher} pitcherTeamAbbr={game.awayAbbr} gameInfo={gameInfo} pool={pool} onClose={() => setExpanded(null)} /></tr>
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
            <td
              className="dg-team-banner"
              colSpan={renderedHeaderCells.length}
              style={{
                background: teamBannerGradient(game.awayAbbr), padding: '7px 8px',
                borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)', boxShadow: '0 -4px 8px -4px rgba(0,0,0,0.4)',
                position: 'sticky', top: 0, zIndex: 5,
              }}
            >
              {bannerContent('away')}
            </td>
          </tr>
          {/* Away's own column-label row, right below away's banner — see
              the big comment above the home pair for why this copy is back. */}
          <tr>{renderedHeaderCells}</tr>
          {displayAway.map((row: BatterRow) => {
            const key = `a-${row.mlb_id ?? row.name}`
            return (
              <React.Fragment key={key}>
                <BatterRowEl
                  row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)}
                  gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} id={key === highlightKey ? 'dugout-highlight-row' : undefined}
                  highlightMode={highlightMode} cellHighlights={cellHighlights[key]} onCellToggle={colKey => toggleCellHighlight(key, colKey)}
                  eraserMode={eraserMode} onEraseRow={() => toggleErased(key)} visibleColumns={visibleDugoutColumns}
                />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} oppPitcher={game.homePitcher} pitcherTeamAbbr={game.homeAbbr} gameInfo={gameInfo} pool={pool} onClose={() => setExpanded(null)} /></tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {hrPopupRow && <HrPopup row={hrPopupRow} onClose={() => setHrPopupRow(null)} />}
    </div>
    {horizontalState.canGoLeft && (
      <button className="dugout-return-player" type="button" onClick={() => scrollBoardTo('start')} aria-label="Return to the Player column" title="Return to Player column" style={{ position: 'absolute', left: 10, bottom: 12, zIndex: 30, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 9px', borderRadius: 999, border: '1px solid var(--accent)', background: 'color-mix(in srgb, var(--surface) 90%, transparent)', backdropFilter: 'blur(10px)', color: 'var(--accent)', fontSize: 10, fontWeight: 850, cursor: 'pointer', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
        <ChevronLeft size={13} aria-hidden="true" /> Player
      </button>
    )}
    {activeTourStep && tourStep != null && (
      <aside className="dugout-table-tour" role="dialog" aria-modal="false" aria-label="Dugout table walkthrough" style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 1200, width: 'min(390px, calc(100vw - 24px))', overflow: 'hidden', border: '1px solid color-mix(in srgb, var(--accent) 52%, var(--border))', borderRadius: 16, background: 'color-mix(in srgb, var(--surface) 96%, transparent)', backdropFilter: 'blur(18px)', boxShadow: '0 24px 70px rgba(0,0,0,.58), 0 0 30px color-mix(in srgb, var(--accent) 12%, transparent)' }}>
        <div style={{ height: 3, background: 'var(--surface-2)' }}>
          <div style={{ width: `${((tourStep + 1) / tableTourSteps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent), #38bdf8)', transition: 'width 220ms ease' }} />
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div className="dugout-tour-icon" style={{ width: 42, height: 42, flex: '0 0 42px', display: 'grid', placeItems: 'center', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)', background: 'var(--accent-dim)', color: 'var(--accent)' }}>
              {activeTourStep.icon === 'pointer' ? <MousePointerClick size={21} /> : activeTourStep.icon === 'book' ? <BookOpen size={21} /> : activeTourStep.icon === 'users' ? <Users size={21} /> : activeTourStep.icon === 'market' ? <BarChart3 size={21} /> : activeTourStep.icon === 'activity' ? <Activity size={21} /> : <BarChart3 size={21} />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{activeTourStep.label}</div>
              <div style={{ marginTop: 3, fontSize: 15, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2 }}>{activeTourStep.title}</div>
            </div>
            <button type="button" onClick={() => setTourStep(null)} aria-label="Close table walkthrough" style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 11, lineHeight: 1.65, color: 'var(--text-2)' }}>{activeTourStep.body}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 14 }}>
            {tableTourSteps.map((step, index) => <span key={step.key} aria-hidden="true" style={{ width: index === tourStep ? 18 : 5, height: 5, borderRadius: 999, background: index <= tourStep ? 'var(--accent)' : 'var(--border)', transition: 'all 180ms ease' }} />)}
            <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text-3)' }}>{tourStep + 1} of {tableTourSteps.length}</span>
            <button type="button" disabled={tourStep === 0} onClick={() => setTourStep(step => step == null ? 0 : Math.max(0, step - 1))} style={{ marginLeft: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: tourStep === 0 ? 'var(--text-4)' : 'var(--text-2)', padding: '6px 10px', fontSize: 10, fontWeight: 800, cursor: tourStep === 0 ? 'default' : 'pointer' }}>Back</button>
            <button type="button" onClick={() => tourStep === tableTourSteps.length - 1 ? setTourStep(null) : setTourStep(tourStep + 1)} style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent)', color: '#06100a', padding: '6px 12px', fontSize: 10, fontWeight: 900, cursor: 'pointer' }}>{tourStep === tableTourSteps.length - 1 ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </aside>
    )}
    </div>
  )
}

// ─── Daily Recap ──────────────────────────────────────────────────────────────
// The exact same board as GameTable — same buildBatterRow pipeline, same
// per-game Paper/MM pool (both lineups, computed exactly like the live
// board), same header columns, same BatterRowEl rows, same HR popup and
// drilldown — just flattened into ONE list across every one of the day's
// games instead of grouped game-by-game, and filtered down to players who
// actually connected on a confirmed HR (row.hr_hits.length > 0). Nothing
// here is a new rendering path; it's the live Dugout's own functions called
// against a different slice of the same /api/dugout/data response.
type DailyRecapRow = {
  row: BatterRow
  oppPitcher: any
  pitcherTeamAbbr: string
  gameInfo: { sport: string; game_pk: string | null; game_date: string | null }
  pool: BatterRow[]
}

export function DailyRecapTable({ data, date }: { data: any; date: string }) {
  const [statcastWindow, setStatcastWindow] = useState<'l1' | 'l3' | 'l5' | 'l10'>('l10')
  const [sort, setSort] = useState<SortState>({ col: 'hr_dist', dir: 'desc' })
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hrPopupRow, setHrPopupRow] = useState<BatterRow | null>(null)
  const toggleExpand = (key: string) => setExpanded(prev => prev === key ? null : key)
  const toggleSort = (col: string) =>
    setSort(prev => prev?.col === col ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { col, dir: 'desc' })
  const sortInfo = (key?: string): { active?: boolean; dir?: 'desc' | 'asc'; rank?: number } => {
    if (!key || sort?.col !== key) return {}
    return { active: true, dir: sort.dir }
  }

  const splitMap   = useMemo(() => buildSplitMap(data?.statSplits ?? []), [data?.statSplits])
  const pitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])
  const fhrAvgMap  = useMemo(() => buildFhrAvgMap(data), [data?.fhrAvg])
  const saAvgMap   = useMemo(() => buildSaAvgMap(data), [data?.saAvg])
  const openingMap = useMemo(() => buildOpeningMap(data), [data?.openingSaRbi])
  const hrMap      = useMemo(() => buildHrMap(data), [data?.hrFeed])
  const nearMap    = useMemo(() => buildNearMap(data), [data?.nearHr])

  // Same per-game buildBatterRow + Paper/MM pool as GameTable's own useMemo
  // (both lineups pooled together, exactly like the live board), just run
  // once per game across the whole day and flattened, keeping only rows
  // that actually connected on a HR. Each survivor carries its own game's
  // opposing pitcher/pool/gameInfo so the drilldown and HR popup work
  // identically to clicking that same row on the live Dugout board.
  const hrRows = useMemo<DailyRecapRow[]>(() => {
    const games = data?.games ?? []
    const out: DailyRecapRow[] = []
    for (const game of games) {
      const communityPicksMap = buildCommunityPicksMap(data, game.gameKey ?? null)
      const ap = game.awayPitcher, hp = game.homePitcher
      const homeRows = (game.homeLineup ?? []).map((p: any) =>
        buildBatterRow(p, ap?.hand || 'R', ap?.id ?? null, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, ap?.matchupEdge ?? null, statcastWindow, true, !!game.homeLineupConfirmed)
      )
      const awayRows = (game.awayLineup ?? []).map((p: any) =>
        buildBatterRow(p, hp?.hand || 'R', hp?.id ?? null, splitMap, pitcherMap, fhrAvgMap, saAvgMap, communityPicksMap, openingMap, hrMap, nearMap, hp?.matchupEdge ?? null, statcastWindow, false, !!game.awayLineupConfirmed)
      )
      const pool = [...homeRows, ...awayRows]
      computePaperScores(pool)
      computeMmRanks(pool)
      computeHitFloorReads(pool, pool.length === 18 && !!game.homeLineupConfirmed && !!game.awayLineupConfirmed)
      const gameInfo = { sport: 'MLB', game_pk: game.gamePk != null ? String(game.gamePk) : null, game_date: date }
      for (const row of homeRows) {
        const hits = row.hr_hits ?? []
        if (!hits.length) continue
        ;(row as any).hr_dist = Math.max(...hits.map((h: any) => h.hit_distance ?? 0))
        ;(row as any).hr_ev   = Math.max(...hits.map((h: any) => h.exit_velocity ?? 0))
        out.push({ row, oppPitcher: ap, pitcherTeamAbbr: game.awayAbbr, gameInfo, pool })
      }
      for (const row of awayRows) {
        const hits = row.hr_hits ?? []
        if (!hits.length) continue
        ;(row as any).hr_dist = Math.max(...hits.map((h: any) => h.hit_distance ?? 0))
        ;(row as any).hr_ev   = Math.max(...hits.map((h: any) => h.exit_velocity ?? 0))
        out.push({ row, oppPitcher: hp, pitcherTeamAbbr: game.homeAbbr, gameInfo, pool })
      }
    }
    return out
  }, [data, splitMap, pitcherMap, fhrAvgMap, saAvgMap, openingMap, hrMap, nearMap, statcastWindow, date])

  const displayRows = useMemo(() => {
    if (!sort) return hrRows
    const order = new Map(sortRowsMulti(hrRows.map(w => w.row), [sort]).map((r, i) => [r, i]))
    return [...hrRows].sort((a, b) => (order.get(a.row) ?? 0) - (order.get(b.row) ?? 0))
  }, [hrRows, sort])

  const visibleColumns = useMemo(() => resolveDugoutColumns(null), [])
  const dugoutHeaderCells = getDugoutHeaderCells(sortInfo, toggleSort, visibleColumns)
  // Real HR outcome detail (not season/recent averages) — the only genuinely
  // new columns beyond what the live board already shows, since "longest
  // HR"/"hardest-hit HR" don't exist as sortable board columns anywhere else.
  const extraHeaderCells = [
    <TH key="hr_dist" label="Dist" title="Longest home run today" w={44} sortKey="hr_dist" {...sortInfo('hr_dist')} onSort={toggleSort} />,
    <TH key="hr_ev" label="EV" title="Hardest-hit home run today" w={40} sortKey="hr_ev" {...sortInfo('hr_ev')} onSort={toggleSort} />,
  ]
  const renderedHeaderCells = [...dugoutHeaderCells, ...extraHeaderCells]

  if (!hrRows.length) {
    return (
      <div style={{ color: 'var(--text-3)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
        No confirmed home runs {date === new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) ? 'yet today' : 'that day'}.
      </div>
    )
  }

  return (
    <div
      className="daily-recap-board-scroll"
      style={{
        overflow: 'auto', maxHeight: 'calc(100dvh - var(--banner-h, 0px) - var(--topbar-h) - 24px)',
        borderRadius: 10, border: '1px solid var(--border)', marginBottom: 8,
        ['--dugout-header-top' as string]: '0px',
      }}
    >
      <table className="dugout-dense-table" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 10, width: 'max-content', minWidth: '100%' }}>
        <tbody>
          <tr>
            <td
              colSpan={renderedHeaderCells.length}
              style={{
                background: 'var(--surface-2)', padding: '7px 8px',
                borderTop: '2px solid var(--accent)', borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, zIndex: 5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-1)' }}>
                  {hrRows.length} confirmed home run{hrRows.length === 1 ? '' : 's'}
                </span>
                <StatcastWindowToggle value={statcastWindow} onChange={setStatcastWindow} />
              </div>
            </td>
          </tr>
          <tr>{renderedHeaderCells}</tr>
          {displayRows.map(({ row, oppPitcher, pitcherTeamAbbr, gameInfo, pool }) => {
            const key = `hr-${row.mlb_id ?? row.name}-${gameInfo.game_pk}`
            return (
              <React.Fragment key={key}>
                <BatterRowEl
                  row={row} pool={pool} expanded={expanded === key} onToggle={() => toggleExpand(key)}
                  gameInfo={gameInfo} onShowHr={() => setHrPopupRow(row)} visibleColumns={visibleColumns}
                  extraCells={[
                    <td key="hr_dist" style={{ ...STD, width: 44, minWidth: 44 }}>{(row as any).hr_dist ? `${Math.round((row as any).hr_dist)} ft` : '—'}</td>,
                    <td key="hr_ev" style={{ ...STD, width: 40, minWidth: 40 }}>{(row as any).hr_ev ? `${((row as any).hr_ev).toFixed(1)}` : '—'}</td>,
                  ]}
                />
                {expanded === key && (
                  <tr><PlayerDrillDown row={row} oppPitcher={oppPitcher} pitcherTeamAbbr={pitcherTeamAbbr} gameInfo={gameInfo} pool={pool} onClose={() => setExpanded(null)} /></tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {hrPopupRow && <HrPopup row={hrPopupRow} onClose={() => setHrPopupRow(null)} />}
      <style>{`
        @media(max-width:640px){
          .daily-recap-board-scroll{max-height:none!important;height:auto!important;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important;overscroll-behavior-x:contain!important;overscroll-behavior-y:auto!important;touch-action:pan-x pan-y!important;border-radius:8px!important;-webkit-overflow-scrolling:touch}
          .daily-recap-board-scroll .dugout-dense-table{font-size:12px!important}
          .daily-recap-board-scroll .dugout-dense-table > tbody > tr > td{padding-top:8px!important;padding-bottom:8px!important}
          .daily-recap-board-scroll .dg-sticky-col{width:172px!important;min-width:172px!important;max-width:172px!important}
          .daily-recap-board-scroll .dg-player-cell-inner{gap:7px!important;padding:6px 5px!important;min-height:48px}
          .daily-recap-board-scroll .dg-player-copy{font-size:11px!important;overflow:hidden}
          .daily-recap-board-scroll .dg-player-name{font-size:12px!important;line-height:1.25!important}
          .daily-recap-board-scroll .dg-expand-indicator{display:grid!important;place-items:center;width:22px;height:22px;margin:-3px -3px -3px 0!important;border-radius:7px;background:var(--surface-2);font-size:9px!important}
          .daily-recap-board-scroll .dg-player-drilldown-cell{padding:0!important;overflow:visible!important}
          .daily-recap-board-scroll .dg-player-drilldown{position:sticky;left:0;width:calc(100vw - 28px);max-width:calc(100vw - 28px);padding:10px;background:color-mix(in srgb,var(--surface) 97%,transparent);border-top:1px solid var(--accent);box-sizing:border-box}
          .daily-recap-board-scroll .dg-player-drilldown-head{display:flex!important;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--border)}
          .daily-recap-board-scroll .dg-player-drilldown-head > span{display:grid;gap:2px;min-width:0;color:var(--text-1);font-size:12px}
          .daily-recap-board-scroll .dg-player-drilldown-head small{color:var(--text-3);font-size:9px;font-weight:650}
          .daily-recap-board-scroll .dg-player-drilldown-head button{min-height:34px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--accent);font-size:10px;font-weight:850}
          .daily-recap-board-scroll .dg-player-drilldown-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:14px!important;width:100%!important}
          .daily-recap-board-scroll .dg-drilldown-section{width:100%!important;min-width:0!important;max-width:100%!important;overflow-x:auto!important;overscroll-behavior-x:contain}
          .daily-recap-board-scroll .dg-drilldown-section > *{max-width:100%}
        }
      `}</style>
    </div>
  )
}

// ─── DugoutClient ─────────────────────────────────────────────────────────────
export function DugoutClient({ date }: { date: string }) {
  const [data, setData]         = useState<any | null>(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [activeGame, setActive] = useState<string | null>(null)
  const [showHrBoard, setShowHrBoard] = useState(false)
  const [showNearHrBoard, setShowNearHrBoard] = useState(false)
  const [showGamePicker, setShowGamePicker] = useState(false)
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() => {
    if (typeof window === 'undefined') return 'compact'
    return window.localStorage.getItem('ss:dugout-density') === 'comfortable' ? 'comfortable' : 'compact'
  })
  useEffect(() => {
    try {
      const panel = window.sessionStorage.getItem('ss:dugout-open-panel')
      setShowHrBoard(panel === 'home-runs')
      setShowNearHrBoard(panel === 'near-home-runs')
    } catch {}
  }, [])
  const gameButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // Which real recency window the Statcast section's "R"/Δ columns read —
  // server precomputes all 5 (season + l1/l3/l5/l10) per batter, so this is
  // just picking which one to render, not a re-fetch. Lives here (not in
  // GameTable) so it survives switching between today's games.
  const [statcastWindow, setStatcastWindow] = useState<'l1' | 'l3' | 'l5' | 'l10'>(() => {
    if (typeof window === 'undefined') return 'l10'
    const saved = window.localStorage.getItem('ss:dugout-statcast-window')
    return saved === 'l1' || saved === 'l3' || saved === 'l5' || saved === 'l10' ? saved : 'l10'
  })
  useEffect(() => {
    try { window.localStorage.setItem('ss:dugout-statcast-window', statcastWindow) } catch { /* session-only when storage is unavailable */ }
  }, [statcastWindow])
  useEffect(() => {
    try { window.localStorage.setItem('ss:dugout-density', density) } catch {}
  }, [density])
  useEffect(() => {
    try {
      if (showHrBoard) window.sessionStorage.setItem('ss:dugout-open-panel', 'home-runs')
      else if (showNearHrBoard) window.sessionStorage.setItem('ss:dugout-open-panel', 'near-home-runs')
      else window.sessionStorage.removeItem('ss:dugout-open-panel')
    } catch {}
  }, [showHrBoard, showNearHrBoard])
  useEffect(() => {
    if (!showGamePicker) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShowGamePicker(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [showGamePicker])

  // Per-member Dugout column show/hide/reorder — fetched once on mount
  // (null while loading behaves identically to "no prefs saved," i.e. show
  // everything in default order, so there's no layout flash while this
  // resolves) and written back through the same direct
  // supabase.from('users').update() pattern PrivacySettingsForm already
  // uses for every other member preference on this table.
  const [columnPrefs, setColumnPrefsState] = useState<DugoutColumnPrefs | null>(null)
  const [showColumnPanel, setShowColumnPanel] = useState(false)
  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const response = await fetch('/api/account/me', { cache: 'no-store', credentials: 'same-origin' })
      if (!response.ok || cancelled) return
      const { profile } = await response.json()
      if (!cancelled && profile?.id === user.id && profile?.dugout_column_prefs) {
        setColumnPrefsState(profile.dugout_column_prefs as DugoutColumnPrefs)
      }
    })()
    return () => { cancelled = true }
  }, [])
  const saveColumnPrefs = async (next: DugoutColumnPrefs) => {
    setColumnPrefsState(next) // update the board immediately — don't wait on the write
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('users').update({ dugout_column_prefs: next }).eq('id', user.id)
  }

  // Deep link from elsewhere (e.g. Weather Lab's park-HR modal) — jump
  // straight to this player's row, expanded, on whichever game he's in
  // today. Read once per navigation, not on every render, since the value
  // only matters right after the data load below picks the right game.
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const highlightMlbId = searchParams.get('highlight')
  const highlightId = highlightMlbId ? parseInt(highlightMlbId, 10) : null

  // Reported live: hitting refresh always landed back on the first game of
  // the day, even after picking a specific one — every other click here
  // only ever touched React state, never the URL, so there was nothing for
  // a fresh page load to recover. Captured once via a ref (not read
  // reactively off searchParams) so restoring it on initial load doesn't
  // fight with setActiveGame's own router.replace calls below — including
  // searchParams as a useEffect dependency here would re-trigger this
  // fetch effect on every tab click, since replace() gives it a new object
  // identity each time.
  const initialGameParamRef = useRef(searchParams.get('game'))

  useEffect(() => {
    setLoading(true); setErr(null); setData(null); setActive(null)
    fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(d => {
        setData(d)
        // Restoring the exact game the user was on beats a highlight deep
        // link beats just defaulting to the first game of the day.
        const restoredGame = initialGameParamRef.current
          ? d.games?.find((g: any) => g.gameKey === initialGameParamRef.current)
          : null
        const targetGame = restoredGame ?? (highlightId != null
          ? d.games?.find((g: any) =>
              g.homeLineup?.some((p: any) => p.mlb_id === highlightId) ||
              g.awayLineup?.some((p: any) => p.mlb_id === highlightId))
          : null)
        setActive((targetGame ?? d.games?.[0])?.gameKey ?? null)
        setLoading(false)
      })
      .catch(e => { setErr(String(e)); setLoading(false) })
  }, [date, highlightId, reloadToken])

  // Real gap (2026-07-24): saving/importing/deleting a Matrix elsewhere in
  // the app (the Matrix panel is mounted globally — see CustomMatrixPanel.tsx
  // — with no direct parent/child link to this page) had no way to reach
  // this component at all. matrixMatches are only ever computed server-side
  // in /api/dugout/data, and the effect above only refetches on date
  // change, so a member had to manually reload the page to see a new/edited
  // Matrix's highlights reflected — confirmed live as the exact "have to
  // refresh instead of instant" report. This does a soft background
  // refetch on that same broadcast instead — updates matrixMatches in
  // place without resetting `active`/`loading` (so it doesn't yank the
  // member back to a different game/tab mid-browse the way the effect
  // above would).
  useEffect(() => {
    const onMatricesUpdated = () => {
      fetch(`/api/dugout/data?date=${date}`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
        .then(d => setData(d))
        .catch(() => {})
    }
    window.addEventListener('ss:matrices-updated', onMatricesUpdated)
    return () => window.removeEventListener('ss:matrices-updated', onMatricesUpdated)
  }, [date])

  // The one place that actually changes which game is active — keeps the
  // URL's ?game= in lockstep so a refresh (or a copy-pasted link) lands
  // back on the exact same game instead of always the first one. `replace`
  // (not push) so flipping between games all day doesn't fill up back-
  // button history with dozens of entries.
  const setActiveGame = useCallback((gameKey: string | null) => {
    setActive(gameKey)
    const params = new URLSearchParams(searchParams.toString())
    if (gameKey) params.set('game', gameKey)
    else params.delete('game')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  useEffect(() => {
    if (!activeGame) return
    const frame = window.requestAnimationFrame(() => {
      gameButtonRefs.current.get(activeGame)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeGame])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      const target = event.target as HTMLElement | null
      if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return
      const games: any[] = data?.games ?? []
      if (games.length < 2) return
      const currentIndex = Math.max(0, games.findIndex(game => game.gameKey === activeGame))
      const nextIndex = event.key === 'ArrowRight'
        ? Math.min(games.length - 1, currentIndex + 1)
        : Math.max(0, currentIndex - 1)
      if (nextIndex === currentIndex) return
      event.preventDefault()
      setActiveGame(games[nextIndex].gameKey)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeGame, data?.games, setActiveGame])

  const splitMap   = useMemo(() => buildSplitMap(data?.statSplits    ?? []), [data?.statSplits])
  const pitcherMap = useMemo(() => buildPitcherMap(data?.pitcherSplits ?? []), [data?.pitcherSplits])

  // get_fhr_history_avg/get_sa_history_avg return one row per (name_norm,
  // bookmaker) with the season-average AMERICAN ODDS PRICE in `avg_price` —
  // not a percentage, and not keyed "fhr_pct"/"pct". Bucket by bookmaker
  // (fanduel -> fd, williamhill_us -> cz) exactly like mlb-party's own map.
  const fhrAvgMap = useMemo(() => buildFhrAvgMap(data), [data?.fhrAvg])
  const saAvgMap = useMemo(() => buildSaAvgMap(data), [data?.saAvg])
  const communityPicksMap = useMemo(() => {
    const activeGameKey = (data?.games ?? []).find((g: any) => g.gameKey === activeGame)?.gameKey
      ?? (data?.games ?? [])[0]?.gameKey ?? null
    return buildCommunityPicksMap(data, activeGameKey)
  }, [data?.communityPicks, data?.games, activeGame])
  const openingMap = useMemo(() => buildOpeningMap(data), [data?.openingSaRbi])
  const hrMap = useMemo(() => buildHrMap(data), [data?.hrFeed])
  const nearMap = useMemo(() => buildNearMap(data), [data?.nearHr])

  if (loading) return (
    <div aria-live="polite" aria-busy="true" style={{ display: 'grid', gap: 10, minHeight: 280 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
        <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
        <div><div style={{ fontSize: 13, fontWeight: 850, color: 'var(--text-1)' }}>Loading The Dugout</div><div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Preparing games, lineups, markets, and Statcast.</div></div>
      </div>
      {[0, 1, 2].map(index => <div key={index} style={{ height: index === 0 ? 46 : 62, borderRadius: 10, border: '1px solid var(--border)', background: 'linear-gradient(100deg, var(--surface) 25%, var(--surface-2) 45%, var(--surface) 65%)', backgroundSize: '220% 100%', animation: 'dugout-skeleton 1.4s ease-in-out infinite' }} />)}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes dugout-skeleton{0%{background-position:100% 0}100%{background-position:-100% 0}}`}</style>
    </div>
  )

  if (err) return (
    <div role="alert" style={{ display: 'grid', justifyItems: 'center', gap: 10, textAlign: 'center', padding: '44px 20px', border: '1px solid rgba(248,113,113,0.28)', borderRadius: 12, background: 'rgba(248,113,113,0.06)' }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>The Dugout could not load</div>
      <div style={{ maxWidth: 520, fontSize: 11, color: 'var(--text-3)' }}>{err}</div>
      <button type="button" onClick={() => setReloadToken(value => value + 1)} style={{ border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', padding: '7px 14px', fontSize: 11, fontWeight: 850, cursor: 'pointer' }}>Try again</button>
    </div>
  )
  if (!data?.games?.length) return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 8, textAlign: 'center', padding: '52px 20px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
      <div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>No games on this slate</div>
      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>There are no Dugout games available for {date}.</div>
      <Link href="/scores" style={{ marginTop: 4, color: 'var(--accent)', fontSize: 11, fontWeight: 800, textDecoration: 'none' }}>View scores</Link>
    </div>
  )

  const games: any[] = data.games
  const active = games.find(g => g.gameKey === activeGame) ?? games[0]
  const activeGameIndex = Math.max(0, games.findIndex(g => g.gameKey === active.gameKey))
  // `locked` is added server-side by /api/dugout/data for below-Ultimate
  // members — always `false` on every game for a real Ultimate (or admin/
  // beta full-access) caller, `false` only on today's one free-preview game
  // otherwise (see getFeaturedGameKey/ultimateForGame in that route).
  const featuredGame = games.find(g => !g.locked)
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

      <div className="dugout-summary-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {/* Game-level (not per-player) — the "No Home Run" side of FanDuel's
            First HR market, i.e. the price on NOBODY hitting a home run in
            this game at all. Scoped to `active` (the selected game tab), not
            the whole slate, since GameTable below is also per-active-game.
            Deliberately bolder than the HR/near-HR pills (solid fill, bigger
            type) rather than matching their pill treatment exactly — this is
            a single live line, not a count to open a panel from. */}
        {active?.noHr && (
          <div className="dugout-summary-action"
            title={
              active.noHr.openingFanduel != null && active.noHr.openingFanduel !== active.noHr.fanduel
                ? `Opened ${oStr(active.noHr.openingFanduel)} → now ${oStr(active.noHr.fanduel)}`
                : undefined
            }
            style={{
              minHeight: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9,
              border: '1.5px solid rgba(167,139,250,0.5)', background: 'rgba(167,139,250,0.16)', color: '#c4b5fd',
              fontSize: 12, fontWeight: 850,
            }}
          >
            <Ban size={14} aria-hidden="true" /> No Home Run
            <span style={{ fontSize: 13, fontWeight: 900, color: '#a78bfa', fontFamily: 'monospace' }}>
              {oStr(active.noHr.fanduel)}
              {active.noHr.openingFanduel != null && active.noHr.openingFanduel !== active.noHr.fanduel && (
                <span style={{ marginLeft: 3, fontSize: 10, color: active.noHr.fanduel < active.noHr.openingFanduel ? '#4ade80' : '#f87171' }}>
                  {active.noHr.fanduel < active.noHr.openingFanduel ? '▼' : '▲'}
                </span>
              )}
            </span>
          </div>
        )}

        {hrCount > 0 && (
          <button className="dugout-summary-action" aria-label={`Open today's ${hrCount} home runs`} onClick={() => { setShowNearHrBoard(false); setShowHrBoard(true) }} style={{
            minHeight: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9,
            border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(74,222,128,0.1)', color: '#4ade80',
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <Flame size={14} aria-hidden="true" /> Home Runs
            <span style={{ background: 'rgba(74,222,128,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{hrCount}</span>
          </button>
        )}

        {nearHrCount > 0 && (
          <button className="dugout-summary-action" aria-label={`Open today's ${nearHrCount} near home runs`} onClick={() => { setShowHrBoard(false); setShowNearHrBoard(true) }} style={{
            minHeight: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9,
            border: '1px solid rgba(251,146,60,0.35)', background: 'rgba(251,146,60,0.1)', color: '#fb923c',
            fontSize: 12, fontWeight: 800, cursor: 'pointer',
          }}>
            <Sparkles size={14} aria-hidden="true" /> Near HRs
            <span style={{ background: 'rgba(251,146,60,0.25)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{nearHrCount}</span>
          </button>
        )}

        {/* Per-account column customization — applies across every game's
            table below, not just the active one, so it lives up here at
            the page level rather than inside GameTable's per-game toolbar. */}
        <button className="dugout-summary-action" onClick={() => setShowColumnPanel(true)} style={{
          minHeight: 36, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, marginLeft: 'auto',
          border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
          fontSize: 12, fontWeight: 800, cursor: 'pointer',
        }}>
          <Settings2 size={14} aria-hidden="true" /> Columns
        </button>
      </div>

      {showColumnPanel && (
        <ColumnCustomizePanel
          prefs={columnPrefs}
          onSave={next => { saveColumnPrefs(next); setShowColumnPanel(false) }}
          onClose={() => setShowColumnPanel(false)}
        />
      )}

      <section className="dugout-game-selector" aria-label="Game selector" style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 13, background: 'var(--surface)', overflow: 'hidden' }}>
        <div style={{ minHeight: 38, padding: '7px 9px 7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '0.02em' }}>
              <span className="dugout-games-label">Games</span>
              <span className="dugout-active-matchup" aria-label={`${active.awayAbbr} at ${active.homeAbbr}`}>
                <TeamLogo abbr={active.awayAbbr} size={22} />
                <span>vs</span>
                <TeamLogo abbr={active.homeAbbr} size={22} />
              </span>
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{activeGameIndex + 1} of {games.length}</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="md:hidden" onClick={() => setShowGamePicker(true)} aria-label="Open all games" style={{ height: 25, padding: '0 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 9, fontWeight: 850, cursor: 'pointer' }}>All games</button>
            <button type="button" title="Previous game (Alt + Left Arrow)" disabled={activeGameIndex === 0} onClick={() => setActiveGame(games[activeGameIndex - 1]?.gameKey ?? active.gameKey)} aria-label="Previous game" style={{ width: 28, height: 25, display: 'grid', placeItems: 'center', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: activeGameIndex === 0 ? 'var(--text-4)' : 'var(--text-2)', cursor: activeGameIndex === 0 ? 'default' : 'pointer' }}>
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <button type="button" title="Next game (Alt + Right Arrow)" disabled={activeGameIndex === games.length - 1} onClick={() => setActiveGame(games[activeGameIndex + 1]?.gameKey ?? active.gameKey)} aria-label="Next game" style={{ width: 28, height: 25, display: 'grid', placeItems: 'center', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: activeGameIndex === games.length - 1 ? 'var(--text-4)' : 'var(--text-2)', cursor: activeGameIndex === games.length - 1 ? 'default' : 'pointer' }}>
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="dugout-game-rail" style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(142px, 1fr)', gap: 7, padding: 8, overflowX: 'auto', overscrollBehaviorX: 'contain', scrollSnapType: 'x proximity', scrollbarWidth: 'thin' }}>
          {games.map(g => {
            const isAct = g.gameKey === active.gameKey
            const isLive = g.status === 'Live'
            const isFin = g.status === 'Final'
            const gameTime = g.gameDate ? new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null
            return (
              <button
                key={g.gameKey}
                ref={node => { if (node) gameButtonRefs.current.set(g.gameKey, node); else gameButtonRefs.current.delete(g.gameKey) }}
                type="button"
                onClick={() => setActiveGame(g.gameKey)}
                aria-label={`${g.awayAbbr} at ${g.homeAbbr}${isLive ? ', live' : isFin ? ', final' : gameTime ? `, ${gameTime}` : ''}`}
                aria-pressed={isAct}
                style={{
                  position: 'relative', scrollSnapAlign: 'start', minWidth: 0, minHeight: 66, padding: '9px 10px',
                  display: 'grid', gridTemplateColumns: '1fr auto', gridTemplateRows: '1fr 1fr', alignItems: 'center', gap: '3px 8px',
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left', overflow: 'hidden',
                  border: isAct ? '1px solid color-mix(in srgb, var(--accent) 75%, white)' : '1px solid var(--border)',
                  background: isAct ? 'linear-gradient(145deg, var(--accent-dim), var(--surface-2) 72%)' : 'var(--surface-2)',
                  boxShadow: isAct ? '0 0 0 1px color-mix(in srgb, var(--accent) 16%, transparent), 0 8px 22px rgba(0,0,0,0.22)' : 'none',
                  opacity: g.locked ? 0.68 : 1, transition: 'border-color 140ms, background 140ms, transform 140ms, box-shadow 140ms',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><TeamLogo abbr={g.awayAbbr} size={20} /><span style={{ fontSize: 10, fontWeight: 850, color: 'var(--text-2)' }}>{g.awayAbbr}</span></span>
                <span style={{ gridRow: '1 / span 2', gridColumn: 2, minWidth: 36, display: 'grid', justifyItems: 'end', alignContent: 'center', gap: 3 }}>
                  {isLive && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 8, fontWeight: 900, color: '#fb7185', letterSpacing: '0.05em' }}><span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }} />LIVE</span>}
                  {isFin && <span style={{ fontSize: 8, fontWeight: 850, color: 'var(--text-3)', letterSpacing: '0.04em' }}>FINAL</span>}
                  {!isLive && !isFin && gameTime && <span style={{ fontSize: 9, fontWeight: 800, color: isAct ? 'var(--accent)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{gameTime}</span>}
                  {(isLive || isFin) && <span style={{ fontSize: 13, fontWeight: 900, fontFamily: 'monospace', color: isAct ? 'var(--text-1)' : 'var(--text-2)' }}>{g.awayScore}<span style={{ padding: '0 3px', color: 'var(--text-4)' }}>–</span>{g.homeScore}</span>}
                  {g.gameNum > 1 && <span style={{ fontSize: 8, fontWeight: 900, color: '#f59e0b' }}>G{g.gameNum}</span>}
                  {g.locked && <Lock size={10} color="var(--text-3)" />}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}><TeamLogo abbr={g.homeAbbr} size={20} /><span style={{ fontSize: 10, fontWeight: 850, color: 'var(--text-2)' }}>{g.homeAbbr}</span></span>
                {isAct && <span aria-hidden="true" style={{ position: 'absolute', left: 10, right: 10, bottom: 0, height: 2, borderRadius: '2px 2px 0 0', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />}
              </button>
            )
          })}
        </div>
      </section>

      {active && (
        active.locked
          ? <GameLockedUpsell
              label="The Dugout"
              featuredMatchup={featuredGame ? `${featuredGame.awayAbbr} @ ${featuredGame.homeAbbr}` : undefined}
            />
          : <GameTable
              key={active.gameKey}
              game={active}
              date={date}
              splitMap={splitMap}
              pitcherMap={pitcherMap}
              fhrAvgMap={fhrAvgMap}
              saAvgMap={saAvgMap}
              communityPicksMap={communityPicksMap}
              openingMap={openingMap}
              hrMap={hrMap}
              nearMap={nearMap}
              highlightMlbId={highlightId}
              statcastWindow={statcastWindow}
              onStatcastWindowChange={setStatcastWindow}
              columnPrefs={columnPrefs}
              density={density}
              onDensityChange={setDensity}
            />
      )}

      {showGamePicker && (
        <div className="dugout-modal-backdrop" onClick={() => setShowGamePicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,.68)', padding: 10 }}>
          <div className="dugout-mobile-sheet dugout-game-picker-sheet" onClick={event => event.stopPropagation()} style={{ width: '100%', maxHeight: '82dvh', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', boxShadow: '0 -18px 60px rgba(0,0,0,.5)' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div><div style={{ fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>Choose a game</div><div style={{ marginTop: 2, fontSize: 10, color: 'var(--text-3)' }}>{games.length} games on this slate</div></div>
              <button type="button" onClick={() => setShowGamePicker(false)} aria-label="Close game picker" style={{ border: 0, background: 'none', color: 'var(--text-2)', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div className="dugout-game-picker-list" style={{ display: 'grid', gap: 7, padding: 10 }}>
              {games.map(game => {
                const selected = game.gameKey === active.gameKey
                const time = game.gameDate ? new Date(game.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''
                return (
                  <button key={game.gameKey} type="button" onClick={() => { setActiveGame(game.gameKey); setShowGamePicker(false) }} aria-pressed={selected} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: '11px 12px', borderRadius: 11, border: selected ? '1px solid var(--accent)' : '1px solid var(--border)', background: selected ? 'var(--accent-dim)' : 'var(--surface-2)', color: 'var(--text-1)', cursor: 'pointer', textAlign: 'left' }}>
                    <span className="dugout-picker-matchup" style={{ display: 'grid', gap: 7 }}><span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TeamLogo abbr={game.awayAbbr} size={22} /><strong>{game.awayAbbr}</strong></span><span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><TeamLogo abbr={game.homeAbbr} size={22} /><strong>{game.homeAbbr}</strong></span></span>
                    <span style={{ display: 'grid', justifyItems: 'end', gap: 4, fontSize: 10, color: 'var(--text-3)' }}><span>{game.status === 'Live' ? 'LIVE' : game.status === 'Final' ? 'FINAL' : time}</span>{(game.status === 'Live' || game.status === 'Final') && <strong style={{ color: 'var(--text-1)', fontFamily: 'monospace', fontSize: 13 }}>{game.awayScore}–{game.homeScore}</strong>}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="dugout-header-help" style={{ marginTop: 10, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6 }}>
        Select any column header for details.
      </div>

      {showHrBoard && (
        <HrLeaderboard
          hits={data.hrFeed ?? []}
          teamByMlbId={teamByMlbId}
          onJumpToGame={gk => { setActiveGame(gk); setShowHrBoard(false) }}
          onClose={() => setShowHrBoard(false)}
        />
      )}

      {showNearHrBoard && (
        <NearHrLeaderboard
          nearHrs={data.nearHr ?? []}
          teamByMlbId={teamByMlbId}
          onJumpToGame={gk => { setActiveGame(gk); setShowNearHrBoard(false) }}
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
        .dugout-dense-table > tbody > tr:hover > td:not(.dg-sticky-col):not(.dg-team-banner){background:rgba(255,255,255,0.025)!important}
        .dugout-dense-table.density-comfortable > tbody > tr > td:not(.dg-team-banner){padding-top:8px!important;padding-bottom:8px!important}
        .dugout-redundant-sort-summary,.dugout-jump-menu{display:none!important}
        .dugout-active-matchup{display:none;align-items:center;gap:6px}
        .dugout-active-matchup > span{color:var(--text-4);font-size:8px;font-weight:900;text-transform:uppercase}
        .dugout-board-enter{animation:dugout-board-in 180ms ease-out both}
        @keyframes dugout-board-in{from{opacity:.45;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
        .dugout-dense-table [data-tutorial-active=true]{position:relative;z-index:8;box-shadow:inset 0 0 0 1px var(--accent),0 0 13px color-mix(in srgb,var(--accent) 38%,transparent)!important;filter:brightness(1.22);animation:dugout-tour-glow 1.25s ease-in-out infinite alternate}
        .dugout-tour-icon{animation:dugout-tour-icon 1.5s ease-in-out infinite}
        @keyframes dugout-tour-glow{from{box-shadow:inset 0 0 0 1px var(--accent),0 0 7px color-mix(in srgb,var(--accent) 24%,transparent)}to{box-shadow:inset 0 0 0 2px var(--accent),0 0 18px color-mix(in srgb,var(--accent) 58%,transparent)}}
        @keyframes dugout-tour-icon{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @media(max-width:640px){
          .dugout-summary-actions{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px!important;margin-bottom:7px!important}
          .dugout-summary-action{width:100%!important;min-width:0!important;min-height:34px!important;margin-left:0!important;padding:5px 8px!important;justify-content:center!important;gap:5px!important;font-size:10px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis}
          .dugout-summary-action > span{min-width:0;flex-shrink:1;padding-left:5px!important;padding-right:5px!important}
          .dugout-summary-action svg{width:13px;height:13px;flex:0 0 13px}
          .dugout-game-selector{margin-bottom:7px!important}
          .dugout-game-rail{display:none!important}
          .dugout-games-label{display:none}
          .dugout-active-matchup{display:inline-flex}
          .dugout-board-nav{min-height:38px;margin-bottom:5px!important;padding:4px 7px!important;gap:7px!important}
          .dugout-board-scroll{--dugout-header-top:0px!important;max-height:none!important;height:auto!important;overflow-x:auto!important;overflow-y:hidden!important;overscroll-behavior-x:contain!important;overscroll-behavior-y:auto!important;touch-action:pan-x pan-y!important;-webkit-overflow-scrolling:auto!important;border-radius:8px!important;scroll-padding-top:36px}
          .dg-team-banner{position:static!important}
          .dg-team-banner-content{gap:7px!important;flex-wrap:nowrap!important;width:max-content!important;min-height:38px}
          .dugout-dense-table{font-size:12px!important}
          .dugout-dense-table > tbody > tr > td:not(.dg-team-banner){padding-top:8px!important;padding-bottom:8px!important}
          .dg-sticky-col{width:172px!important;min-width:172px!important;max-width:172px!important}
          .dg-player-cell-inner{gap:7px!important;padding:6px 5px!important;min-height:48px}
          .dg-player-copy{font-size:11px!important;overflow:hidden}
          .dg-player-name{font-size:12px!important;line-height:1.25!important}
          .dg-expand-indicator{display:grid!important;place-items:center;width:22px;height:22px;margin:-3px -3px -3px 0!important;border-radius:7px;background:var(--surface-2);font-size:9px!important}
          .dg-player-drilldown-cell{padding:0!important;overflow:visible!important}
          .dg-player-drilldown{position:sticky;left:0;width:calc(100vw - 28px);max-width:calc(100vw - 28px);padding:10px;background:color-mix(in srgb,var(--surface) 97%,transparent);border-top:1px solid var(--accent);box-sizing:border-box}
          .dg-player-drilldown-head{display:flex!important;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px solid var(--border)}
          .dg-player-drilldown-head > span{display:grid;gap:2px;min-width:0;color:var(--text-1);font-size:12px}
          .dg-player-drilldown-head small{color:var(--text-3);font-size:9px;font-weight:650}
          .dg-player-drilldown-head button{min-height:34px;display:inline-flex;align-items:center;gap:5px;padding:0 10px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--accent);font-size:10px;font-weight:850}
          .dg-player-drilldown-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:14px!important;width:100%!important}
          .dg-drilldown-section{width:100%!important;min-width:0!important;max-width:100%!important;overflow-x:auto!important;overscroll-behavior-x:contain}
          .dg-drilldown-section > *{max-width:100%}
          .dg-team-banner-content button{min-height:34px!important;min-width:34px}
          .dg-team-banner-content a{min-height:34px;display:inline-flex!important;align-items:center}
          .dugout-modal-backdrop{align-items:flex-end!important;padding:0!important;overscroll-behavior:contain}
          .dugout-mobile-sheet{position:relative;width:100%!important;min-width:0!important;max-width:100%!important;max-height:calc(100dvh - 72px)!important;resize:none!important;border-radius:18px 18px 0 0!important;border-bottom:0!important;padding-bottom:max(12px,env(safe-area-inset-bottom));box-shadow:0 -18px 60px rgba(0,0,0,.58)!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
          .dugout-mobile-sheet::before{content:"";display:block;position:absolute;top:7px;left:50%;z-index:5;width:38px;height:4px;border-radius:99px;background:var(--text-4);transform:translateX(-50%);opacity:.65}
          .dugout-mobile-sheet > :first-child{padding-top:18px!important}
          .dugout-columns-sheet{max-height:calc(100dvh - 32px)!important}
          .dugout-columns-sheet button{min-height:36px}
          .dugout-columns-sheet input{height:42px!important;font-size:16px!important}
          .dugout-leaderboard-sheet{height:min(78dvh,720px)!important}
          .dugout-game-picker-sheet{max-height:calc(100dvh - 52px)!important;padding-bottom:0!important}
          .dugout-game-picker-list{padding-bottom:var(--mobile-dock-clearance)!important;scroll-padding-bottom:var(--mobile-dock-clearance)}
          .dugout-picker-matchup{display:flex!important;align-items:center;justify-content:start;gap:7px!important}
          .dugout-picker-matchup > span{display:flex!important;align-items:center;gap:0!important}
          .dugout-picker-matchup strong{font-size:0}
          .dugout-picker-matchup > span:first-child::after{content:"vs";margin-left:7px;color:var(--text-4);font-size:8px;font-weight:900;text-transform:uppercase}
          .dugout-game-picker-sheet button{min-height:58px}
          .dugout-return-player,.dugout-header-help{display:none!important}
          .dugout-table-tour{right:12px!important;bottom:96px!important}
        }
        /* The website should follow the browser's normal vertical document
           scroll at laptop and desktop widths. The bounded two-axis board is
           reserved for the native desktop app, whose outer shell is itself a
           fixed-height workspace. Without this override, a web user entering
           the table traps the wheel inside a viewport-sized nested scroller
           and the page feels frozen. */
        @media(min-width:641px){
          html[data-platform='web'] .dugout-board-scroll{max-height:none!important;height:auto!important;overflow-x:auto!important;overflow-y:hidden!important;overscroll-behavior-x:contain!important;overscroll-behavior-y:auto!important;touch-action:pan-x pan-y!important;scrollbar-gutter:auto!important}
          html[data-platform='web'] .dg-team-banner{top:auto!important}
          html[data-platform='web'] .dugout-dense-table tr > th{top:auto!important}
        }
        @media (prefers-reduced-motion:reduce){.dugout-board-enter,.dugout-dense-table [data-tutorial-active=true],.dugout-tour-icon{animation:none}}
      `}</style>
    </div>
  )
}
