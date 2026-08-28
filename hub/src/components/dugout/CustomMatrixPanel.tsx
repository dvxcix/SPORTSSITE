'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Reorder, useDragControls, type DragControls } from 'motion/react'
import { Grid3x3, Plus, Pencil, Trash2, Copy, Check, X, GripVertical, Share2, ShoppingBag } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { effectiveTier, hasFullAccessOverride, hasTierAccess, type Tier } from '@slipsurge/core/tiers'
import { useDraggableFab } from '@/lib/useDraggableFab'
import { BookLogo } from '@/components/BookLogo'
import { PipelineBuilder, type MatrixPipelineStep } from './PipelineBuilder'
import { PipelineSummary } from './PipelineSummary'
import { useRouter } from 'next/navigation'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { ModalSurface } from '@/components/ui/ModalSurface'

// "Custom Matrix" — a member's own saved highlight rules for The Dugout's
// batter table. Terminology is deliberately its own: a saved rule is a
// "Matrix", built from "Elements", each one a "Factor" — paraphrased away
// from a competitor's naming rather than reusing it (see matrixEngine.ts's
// own header comment for the full data-source breakdown this UI drives).

export type MmWindowKey = 'l1' | 'l3' | 'l5' | 'l10'
export type MmTrendDirection = 'increased' | 'decreased' | 'moved' | 'crossed_positive' | 'crossed_negative' | 'flat'

export type MatrixFactor = {
  id?: string
  category: 'odds' | 'dugout_specs' | 'pitchlog_stat' | 'savant_stat' | 'picks'
  field_key: string
  operator: 'gte' | 'lte' | 'eq' | 'up' | 'down' | 'flat' | 'up_or_flat' | 'down_or_flat' | 'positive' | 'negative' | 'zero' | 'tied' | 'is_null' | 'is_not_null' | 'mm_trend'
  value: number | null
  recency: 'game' | 'l3' | 'l5' | 'l10' | 'season' | 'custom' | 'game_delta' | 'l3_delta' | 'l5_delta' | 'l10_delta' | null
  // Only meaningful for the two real multi-book odds fields (fhr, hr) —
  // which book(s) to check. null/empty defaults to FanDuel only, same as
  // every other odds Factor.
  books: string[] | null
  // null = every book in `books` must satisfy the Factor. A number = "at
  // least N of `books`" — e.g. "3+ of FHR's books moved up since open."
  books_min_count: number | null
  // Only meaningful for operator 'tied' — 'team' (the default, incl. null)
  // compares only this player's own side; 'game' pools both teams.
  tie_scope: 'team' | 'game' | null
  // Only meaningful for operator 'tied' — when the pool has more than one
  // raw tie cluster at different values, null keeps every cluster (the
  // original behavior); 'highest'/'lowest' narrows to just the single
  // cluster at that extreme before any tiebreaker chain below runs on it.
  tie_direction: 'highest' | 'lowest' | null
  // Only meaningful for operator 'tied' — an ordered fallback chain that
  // narrows a raw tie group down to whoever ranks best on some OTHER field
  // (any category — e.g. "of everyone tied on HR÷Parlay, keep the highest
  // recent Attack Angle"). Empty = every member of the raw tie group counts,
  // the original plain-tie behavior. See matrixEngine.ts's resolveTiebreakers.
  tiebreakers: MatrixTiebreaker[]
  // Only meaningful for operator 'mm_trend' — see matrixEngine.ts's
  // evaluateMmTrend. baseWindow is the reference point; compareWindows (1-3
  // of the other three) are each checked against it.
  mm_base_window: MmWindowKey | null
  mm_compare_windows: MmWindowKey[] | null
  mm_direction: MmTrendDirection | null
  // null/'any' = the trend only needs to hold in ANY one of
  // mm_compare_windows; 'all' = it must hold in every one of them.
  mm_match_mode: 'any' | 'all' | null
  // Only meaningful alongside mm_direction 'increased'/'decreased' + a
  // non-null value — null/'at_least' = value is a floor ("moved 2+");
  // 'exactly' = an exact match ("moved exactly 2"). See matrixEngine.ts's
  // MmAmountMode.
  mm_amount_mode: 'at_least' | 'exactly' | null
}

export type MatrixTiebreaker = {
  category: MatrixFactor['category']
  field_key: string
  recency: MatrixFactor['recency']
  book: string | null
  // closest_zero ranks by absolute distance from 0 (e.g. DIV's -0.7 vs 0.4
  // — 0.4 wins), excluding a literal 0 from candidacy entirely. farthest_zero
  // is the mirror — biggest absolute swing either direction wins instead.
  direction: 'highest' | 'lowest' | 'closest_zero' | 'farthest_zero'
  // null/0 keeps the exact-match behavior; a positive number also keeps
  // anyone within that raw distance of the best value, so a real standout
  // no longer needs an exact 2-decimal match to survive. See
  // matrixEngine.ts's MatrixTiebreaker.tolerance for the full rationale.
  tolerance: number | null
  // Only meaningful for direction 'closest_zero' — false/null (default)
  // excludes a literal 0 (right for DIV, where 0 usually means no line/no
  // data); true lets 0 win like any other value (right for MM, where 0 is
  // a real "no movement" reading). See matrixEngine.ts's
  // MatrixTiebreaker.zero_eligible.
  zero_eligible: boolean | null
  // Only meaningful for field_key 'mm_move' — see MmMoveWindowPicker below.
  mm_base_window: MmWindowKey | null
  mm_compare_windows: MmWindowKey[] | null
}

export type MatrixDef = {
  id: string
  name: string
  color: string
  priority: number
  match_mode: 'all' | 'any'
  match_any_count: number | null
  element_code: string
  enabled: boolean
  factors: MatrixFactor[]
  // 'classic' (default — every Matrix before Pipeline mode existed) is the
  // Elements/Factors system above. 'pipeline' ignores match_mode/factors
  // entirely and uses pipeline_scope/pipeline_steps instead — see
  // PipelineBuilder.tsx. A Matrix's mode is fixed at creation, not
  // switchable afterward (see MatrixEditor).
  matrix_type: 'classic' | 'pipeline'
  pipeline_scope: 'team' | 'game' | null
  pipeline_steps: MatrixPipelineStep[]
}

const ODDS_FIELDS: { key: string; label: string; deltaOnly?: boolean }[] = [
  { key: 'fhr', label: 'First HR' },
  { key: 'hr', label: 'Anytime HR' },
  { key: 'hrml', label: 'HR / Moneyline Parlay' },
  { key: 'laser', label: 'Laser (105+ MPH HR)' },
  { key: 'laser110', label: 'Laser (110+ MPH HR)' },
  { key: 'moonshot', label: 'Moonshot' },
  { key: 'pa1', label: '1st PA Home Run' },
  { key: 'rbi1', label: '1+ RBI' },
  { key: 'rbi2', label: '2+ RBI' },
  { key: 'rbi3', label: '3+ RBI' },
  { key: 'tb2', label: '2+ Total Bases' },
  { key: 'tb3', label: '3+ Total Bases' },
  { key: 'tb4', label: '4+ Total Bases' },
  { key: 'tb5', label: '5+ Total Bases' },
  { key: 'hr2', label: '2+ Home Runs' },
  { key: 'singles', label: '1+ Single' },
  { key: 'doubles', label: '1+ Double' },
  { key: 'triples', label: '1+ Triple' },
  { key: 'sb1', label: '1+ Stolen Base' },
  { key: 'sb2', label: '2+ Stolen Bases' },
  { key: 'hits1', label: '1+ Hit' },
  { key: 'hits2', label: '2+ Hits' },
  { key: 'runs1', label: '1+ Run' },
  { key: 'runs2', label: '2+ Runs' },
  { key: 'booksfhr', label: 'Books missing First HR odds', deltaOnly: false },
  { key: 'bookshr', label: 'Books missing Anytime HR odds', deltaOnly: false },
]
const STAT_FIELDS: { key: string; label: string }[] = [
  { key: 'pa', label: 'Plate Appearances' }, { key: 'h', label: 'Hits' },
  { key: '1b', label: 'Singles' }, { key: '2b', label: 'Doubles' }, { key: '3b', label: 'Triples' },
  { key: 'hr', label: 'Home Runs' }, { key: 'bb', label: 'Walks' }, { key: 'k', label: 'Strikeouts' },
  { key: 'avg', label: 'Batting Average' }, { key: 'obp', label: 'On-Base %' }, { key: 'slg', label: 'Slugging %' },
  { key: 'whiff', label: 'Whiff %' }, { key: 'chase', label: 'Chase %' },
  { key: 'avgev', label: 'Avg Exit Velocity' }, { key: 'la', label: 'Avg Launch Angle' },
  { key: 'hh', label: 'Hard-Hit %' }, { key: 'brl', label: 'Barrel %' }, { key: 'sweetspot', label: 'Sweet Spot %' }, { key: 'xwoba', label: 'xwOBA (Contact)' },
  { key: 'bspd', label: 'Avg Bat Speed' }, { key: 'atk', label: 'Avg Attack Angle' },
  { key: 'swlen', label: 'Avg Swing Length' }, { key: 'tilt', label: 'Avg Swing Tilt' }, { key: 'attackdir', label: 'Avg Attack Direction' },
]
// Labels deliberately echo the board's own header glyphs where one exists
// (💥/R 💥 for Blast %, DugoutClient.tsx's Statcast column group) so a
// member scanning this dropdown for "the blast columns" recognizes the
// match instead of having to already know it's filed under "Bat Tracking."
const SAVANT_FIELDS: { key: string; label: string }[] = [
  { key: 'hardsw', label: 'Hard-Swing %' }, { key: 'sq', label: 'Squared-Up %' }, { key: 'blast', label: '💥 Blast %' },
  { key: 'idlaa', label: 'Ideal Attack-Angle %' }, { key: 'pullair', label: 'Pull Air Rate' }, { key: 'fb', label: 'Fly-Ball Rate' },
  { key: 'timing', label: 'Timing %' }, { key: 'miss', label: 'Miss Distance' },
]
// "Dugout Specs" — the Dugout table's own computed columns (not raw
// sportsbook prices): implied-probability ratios between two markets, plus
// this player's own today-vs-his-season-average price deltas. Field keys
// match the exact same ones evaluateDugoutSpecsFactor computes server-side
// off the real props object — see matrixEngine.ts.
const DUGOUT_SPECS_FIELDS: { key: string; label: string; signed?: boolean; boolean?: boolean }[] = [
  { key: 'is_pwr', label: 'Is PWR ⚡?', boolean: true },
  { key: 'div', label: 'DIV (FD − Caesars FHR)', signed: true },
  { key: 'fhr_div_sa', label: 'FHR ÷ HR' },
  { key: 'm_div_f', label: 'M ÷ F (BetMGM ÷ FanDuel)' },
  { key: 'sa_div_ml', label: 'HR ÷ Parlay' },
  { key: 'pa1_div_sa', label: 'PA ÷ HR' },
  { key: 'sa_div_rbi', label: 'HR ÷ RBI' },
  { key: 'sa_div_rbi2', label: 'HR ÷ RBI2' },
  { key: 'sa_div_rbi3', label: 'HR ÷ RBI3' },
  { key: 'sa_div_hrr', label: 'HR ÷ HRR' },
  { key: 'sa_div_tb', label: 'HR ÷ TB' },
  { key: 'sa_div_tb3', label: 'HR ÷ TB3' },
  { key: 'sa_div_tb4', label: 'HR ÷ TB4' },
  { key: 'sa_div_tb5', label: 'HR ÷ TB5' },
  { key: 'sa_div_hr2', label: 'HR ÷ 2HR' },
  { key: 'fhr_pct', label: 'FHR % (vs. season avg)', signed: true },
  { key: 'sa_pct', label: 'HR % (vs. season avg)', signed: true },
  // The board's own ❓ column — sportsbook rank minus Statcast-composite
  // rank (negative = the market's more bullish on this guy than the
  // numbers are; positive = the numbers like him more than the market
  // does). Ranked across the WHOLE GAME, both lineups — see
  // computeMmByWindowForGame (dugoutPaperScore.ts). The one dugout_specs
  // field with a real recency selector, since it changes with whichever
  // Statcast window (Last 1/3/5/10) is behind the "Statcast rank" half.
  { key: 'mm', label: 'MM (Sportsbook Rank − Statcast Rank)', signed: true },
  // The two raw ranks 'mm' above is the difference of — exposed separately
  // so a Factor/Pipeline step can filter/rank on either alone (e.g. "top 4
  // sportsbook favorites in the game," which the difference field can't
  // express on its own). Same per-game-pool precompute, same 4 windows.
  { key: 'bk_rk', label: 'Sportsbook Rank (Anytime HR, 1 = game favorite)' },
  { key: 'pp_rk', label: 'Statcast Rank (Paper Score, 1 = best in game)' },
  // Real gap, reported live (2026-07-26): once a member filters down to
  // whoever's MM moved a certain way (via the 'mm_trend' operator above),
  // there was no way to then pick a WINNER among survivors by "whoever
  // moved the most" — a plain numeric field, usable as a Rank/Group field
  // (Pipeline) or a tiebreaker field (Classic 'tied' chain) so "highest"
  // means "biggest mover" directly. Also usable as an ordinary Filter
  // threshold (e.g. "moved 3+ in either direction") — see MmMoveWindowPicker.
  { key: 'mm_move', label: 'MM Movement (biggest change across windows)' },
]
// Community pick counts — a plain threshold, or (the "% of Game" variant)
// this player's share of his own game's total picks for that market across
// all 18 real batters, not just a raw count (see evaluatePicksFactor).
const PICKS_FIELDS: { key: string; label: string }[] = [
  { key: 'hr', label: 'HR Picks' }, { key: 'hrPct', label: 'HR Picks — % of Game' },
  { key: 'hits', label: 'Hits Picks' }, { key: 'hitsPct', label: 'Hits Picks — % of Game' },
  { key: 'runs', label: 'Runs Picks' }, { key: 'runsPct', label: 'Runs Picks — % of Game' },
  { key: 'stolenBases', label: 'Stolen Base Picks' }, { key: 'stolenBasesPct', label: 'Stolen Base Picks — % of Game' },
  { key: 'singles', label: 'Singles Picks' }, { key: 'singlesPct', label: 'Singles Picks — % of Game' },
  { key: 'doubles', label: 'Doubles Picks' }, { key: 'doublesPct', label: 'Doubles Picks — % of Game' },
  { key: 'triples', label: 'Triples Picks' }, { key: 'triplesPct', label: 'Triples Picks — % of Game' },
  { key: 'rbi', label: 'RBI Picks' }, { key: 'rbiPct', label: 'RBI Picks — % of Game' },
  { key: 'hrr', label: 'HRR Picks' }, { key: 'hrrPct', label: 'HRR Picks — % of Game' },
  { key: 'tb', label: 'TB Picks' }, { key: 'tbPct', label: 'TB Picks — % of Game' },
]
export const CATEGORY_LABEL: Record<MatrixFactor['category'], string> = {
  odds: 'Odds', dugout_specs: 'Dugout Specs', pitchlog_stat: 'Stat Line', savant_stat: 'Bat Tracking', picks: 'Picks',
}
// Real gap, reported live (2026-07-25): every one of these windows —
// including 'season' — is filtered to ONE opposing-pitcher hand before the
// window is even sliced (see matrixEngine.ts's sliceRecencyWindow: "vsHand
// = allRows.filter(r => r.p_throws === pitcherHand ...)" runs FIRST, then
// game/l3/l5/l10/season all operate on that already-narrowed pool). Which
// hand depends entirely on whoever that player's real opponent is in each
// game a saved Factor gets evaluated against — a batter who simply hasn't
// faced many righties lately can show "0 HR" on a bare "Last 10" Factor
// while his real last-10-games total (both hands combined) is nowhere near
// zero. Confirmed live against a real player (Jackson Merrill: last-10
// vs-RHP window showed 0 HR/7 AB while his actual last 10 games, both
// hands, had 4 HR) — the number itself wasn't wrong, but "Last 10" with no
// disclosure of the hand-scoping is actively misleading. Every label below
// now says so; there's no way to show a fixed hand here (unlike a live
// per-game display where tonight's opponent is a known fact) since a
// saved Factor runs against a different, changing opponent every night.
export const RECENCY_LABEL: Record<string, string> = {
  game: 'Last Game (vs. matching hand)', l3: 'Last 3 (vs. matching hand)', l5: 'Last 5 (vs. matching hand)',
  l10: 'Last 10 (vs. matching hand)', season: 'Season (vs. matching hand)', custom: 'Custom Range',
  game_delta: 'Last Game (Δ vs. Season, matching hand)', l3_delta: 'Last 3 (Δ vs. Season, matching hand)',
  l5_delta: 'Last 5 (Δ vs. Season, matching hand)', l10_delta: 'Last 10 (Δ vs. Season, matching hand)',
}
// savant_stat's 'game' recency resolves to the exact same window the
// board's own StatcastWindowToggle calls "Last 1" (l1) — see
// RECENCY_TO_SAVANT_WINDOW in matrixEngine.ts — but shares RECENCY_LABEL's
// generic 'Last Game' wording with pitchlog_stat, where 'game' really does
// mean a real most-recently-played game, a subtly different concept.
// Reported live: a member looking for the board's "Last 1/3/5/10" toggle
// didn't recognize "Last Game" as the same option. l3/l5/l10 already read
// identically to the board ('Last 3'/'Last 5'/'Last 10'); only 'game'
// needed a category-specific override.
export function recencyLabel(category: MatrixFactor['category'], r: string): string {
  if ((category === 'savant_stat' || category === 'dugout_specs') && r === 'game') return 'Last 1 (vs. matching hand)'
  if (category === 'savant_stat' && r === 'game_delta') return 'Last 1 (Δ vs. Season, matching hand)'
  return RECENCY_LABEL[r] ?? r
}
// Every field the Dugout board itself actually renders a Δ (recent minus
// season) value for — see DugoutClient.tsx's d_* variables/header cells —
// which is exactly the real number the '_delta' recency removal above was
// worried a member had nothing to calibrate against. This list had gone
// stale (only bspd/sweetspot/sq were listed here even after "Add R·/Δ for
// all remaining Statcast fields" gave the grid Δ columns for everything
// else below) — a field with a real Δ column in the grid but no Δ option in
// this picker was silently unreachable as a Matrix condition. Keep this in
// sync with DugoutClient.tsx's own d_* set; every field NOT listed here
// really does stay exact-window-only (no d_* counterpart exists for it).
const DELTA_DISPLAYED_FIELDS: Partial<Record<MatrixFactor['category'], string[]>> = {
  pitchlog_stat: ['bspd', 'sweetspot', 'swlen', 'atk', 'tilt', 'brl', 'hh', 'avgev', 'la'],
  savant_stat: ['sq', 'hardsw', 'blast', 'idlaa', 'timing', 'miss', 'pullair', 'fb'],
}
export function recencyOptionsFor(category: MatrixFactor['category'], field_key: string): string[] {
  // MM/bk_rk/pp_rk have no "Season" concept of their own (see MmByWindow,
  // matrixEngine.ts) — always one of the board's own 4 windows, never a delta.
  if (category === 'dugout_specs' && (field_key === 'mm' || field_key === 'bk_rk' || field_key === 'pp_rk')) return ['game', 'l3', 'l5', 'l10']
  const base = ['game', 'l3', 'l5', 'l10', 'season']
  if (!DELTA_DISPLAYED_FIELDS[category]?.includes(field_key)) return base
  return [...base, 'game_delta', 'l3_delta', 'l5_delta', 'l10_delta']
}
export const OPERATOR_LABEL: Record<string, string> = {
  gte: 'At least', lte: 'At most', eq: 'Exactly',
  up: 'Moved up since open', down: 'Moved down since open', flat: 'Unchanged since open',
  up_or_flat: 'Moved up, or unchanged (not down)', down_or_flat: 'Moved down, or unchanged (not up)',
  positive: 'Is positive (+)', negative: 'Is negative (−)', zero: 'Is zero (0)',
  tied: 'Tied w/ a teammate',
  is_null: 'Is blank (no value)', is_not_null: 'Has a value',
  mm_trend: 'Trend across L1/L3/L5/L10',
}

export type FactorField = { key: string; label: string; signed?: boolean; boolean?: boolean }
const FIELDS_BY_CATEGORY: Record<MatrixFactor['category'], FactorField[]> = {
  odds: ODDS_FIELDS, dugout_specs: DUGOUT_SPECS_FIELDS, pitchlog_stat: STAT_FIELDS, savant_stat: SAVANT_FIELDS, picks: PICKS_FIELDS,
}
export function fieldsForCategory(cat: MatrixFactor['category']): FactorField[] {
  return FIELDS_BY_CATEGORY[cat]
}
export function fieldLabel(cat: MatrixFactor['category'], key: string) {
  return fieldsForCategory(cat).find(f => f.key === key)?.label ?? key
}
function newFactor(): MatrixFactor {
  return {
    category: 'odds', field_key: 'fhr', operator: 'gte', value: null, recency: null, books: null, books_min_count: null,
    tie_scope: null, tie_direction: null, tiebreakers: [],
    mm_base_window: null, mm_compare_windows: null, mm_direction: null, mm_match_mode: null, mm_amount_mode: null,
  }
}
// The board's own 4 MM windows, broadest to narrowest — same order the
// board's own recency toggle presents them in.
export const MM_WINDOWS: { key: MmWindowKey; label: string }[] = [
  { key: 'l10', label: 'L10' }, { key: 'l5', label: 'L5' }, { key: 'l3', label: 'L3' }, { key: 'l1', label: 'L1' },
]
export const MM_DIRECTION_LABEL: Record<MmTrendDirection, string> = {
  increased: 'Increased', decreased: 'Decreased', moved: 'Moved (either direction)',
  crossed_positive: 'Crossed to positive (+)', crossed_negative: 'Crossed to negative (−)',
  flat: 'Stayed flat (no change)',
}
// Shared by Classic Factors (FactorRow) and Pipeline filter steps
// (PipelineStepCard) — both let a member reuse this exact block since a
// 'mm_trend' condition needs the same 4 inputs (base window, direction, an
// optional minimum move amount, and which OTHER window(s) to check it
// against) regardless of which builder it's being edited in. `onPatch`
// receives only the fields that changed — each caller spreads it onto its
// own Factor/Step shape, which already share these exact field names.
export function MmTrendFields({ baseWindow, compareWindows, direction, amount, matchMode, amountMode, onPatch }: {
  baseWindow: MmWindowKey | null
  compareWindows: MmWindowKey[] | null
  direction: MmTrendDirection | null
  amount: number | null
  matchMode: 'any' | 'all' | null
  amountMode?: 'at_least' | 'exactly' | null
  onPatch: (patch: {
    mm_base_window?: MmWindowKey; mm_compare_windows?: MmWindowKey[]; mm_direction?: MmTrendDirection
    value?: number | null; mm_match_mode?: 'any' | 'all'; mm_amount_mode?: 'at_least' | 'exactly' | null
  }) => void
}) {
  const base = baseWindow ?? 'l10'
  const compare = compareWindows ?? []
  const needsAmount = direction === 'increased' || direction === 'decreased' || direction === 'moved'
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, width: '100%', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>FROM</span>
      <select
        className="ss-input" value={base}
        onChange={e => {
          const nextBase = e.target.value as MmWindowKey
          onPatch({ mm_base_window: nextBase, mm_compare_windows: compare.filter(w => w !== nextBase) })
        }}
        style={{ fontSize: 11, padding: '5px 6px', width: 66 }}
      >
        {MM_WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
      </select>

      <select
        className="ss-input" value={direction ?? 'decreased'}
        onChange={e => onPatch({ mm_direction: e.target.value as MmTrendDirection })}
        style={{ fontSize: 11, padding: '5px 6px', width: 160 }}
      >
        {(Object.keys(MM_DIRECTION_LABEL) as MmTrendDirection[]).map(d => <option key={d} value={d}>{MM_DIRECTION_LABEL[d]}</option>)}
      </select>

      {needsAmount && (
        <>
          <select
            className="ss-input" value={amountMode ?? 'at_least'}
            onChange={e => onPatch({ mm_amount_mode: e.target.value as 'at_least' | 'exactly' })}
            title="Whether the amount below is a minimum (2 or more) or an exact match (exactly 2)"
            style={{ fontSize: 11, padding: '5px 6px', width: 92 }}
          >
            <option value="at_least">At least</option>
            <option value="exactly">Exactly</option>
          </select>
          <input
            className="ss-input" type="number" min={0} placeholder="any amount"
            title={amountMode === 'exactly' ? 'Exact rank move required — leave blank for any move at all in this direction' : 'Minimum move required — leave blank for any move at all in this direction'}
            value={amount ?? ''}
            onChange={e => onPatch({ value: e.target.value === '' ? null : Math.abs(Number(e.target.value)) })}
            style={{ fontSize: 11, padding: '5px 6px', width: 84 }}
          />
        </>
      )}

      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>IN</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {MM_WINDOWS.filter(w => w.key !== base).map(w => {
          const on = compare.includes(w.key)
          return (
            <button
              key={w.key}
              onClick={() => onPatch({ mm_compare_windows: on ? compare.filter(k => k !== w.key) : [...compare, w.key] })}
              style={{
                fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                color: on ? 'var(--accent)' : 'var(--text-3)',
                background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
              }}
            >
              {w.label}
            </button>
          )
        })}
      </div>

      {compare.length > 1 && (
        <select
          className="ss-input" value={matchMode ?? 'any'}
          onChange={e => onPatch({ mm_match_mode: e.target.value as 'any' | 'all' })}
          title="Whether the trend needs to hold in ANY of the checked windows, or ALL of them"
          style={{ fontSize: 10, padding: '4px 5px', width: 150 }}
        >
          <option value="any">True in any checked window</option>
          <option value="all">True in every checked window</option>
        </select>
      )}
    </div>
  )
}

// field_key 'mm_move' — the magnitude of a player's biggest MM swing between
// a base window and whichever OTHER window(s) are checked (see
// computeMmMoveValue, matrixEngine.ts). No direction/amount here (unlike
// MmTrendFields) — "highest" on this value already means "moved the most,"
// regardless of which way. Shared by Filter/Group/Rank steps (Pipeline) and
// tiebreaker chains (Classic 'tied' Factors) — anywhere a member ranks or
// thresholds on "who moved the most."
export function MmMoveWindowPicker({ baseWindow, compareWindows, onPatch }: {
  baseWindow: MmWindowKey | null
  compareWindows: MmWindowKey[] | null
  onPatch: (patch: { mm_base_window?: MmWindowKey; mm_compare_windows?: MmWindowKey[] }) => void
}) {
  const base = baseWindow ?? 'l10'
  const compare = compareWindows ?? []
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, width: '100%', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>MOVEMENT FROM</span>
      <select
        className="ss-input" value={base}
        onChange={e => {
          const nextBase = e.target.value as MmWindowKey
          onPatch({ mm_base_window: nextBase, mm_compare_windows: compare.filter(w => w !== nextBase) })
        }}
        style={{ fontSize: 11, padding: '5px 6px', width: 66 }}
      >
        {MM_WINDOWS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
      </select>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>VS</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {MM_WINDOWS.filter(w => w.key !== base).map(w => {
          const on = compare.includes(w.key)
          return (
            <button
              key={w.key}
              onClick={() => onPatch({ mm_compare_windows: on ? compare.filter(k => k !== w.key) : [...compare, w.key] })}
              style={{
                fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                color: on ? 'var(--accent)' : 'var(--text-3)',
                background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
              }}
            >
              {w.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
function newTiebreaker(): MatrixTiebreaker {
  return { category: 'pitchlog_stat', field_key: STAT_FIELDS[0].key, recency: 'season', book: null, direction: 'highest', tolerance: null, zero_eligible: null, mm_base_window: null, mm_compare_windows: null }
}
const SWATCHES = ['#B4FF4D', '#4D9EFF', '#FF4D6A', '#FFB84D', '#A855F7', '#2ED573', '#FF8FA3', '#5EEAD4']

// The two odds fields this app actually carries real prices from more than
// one book for — every other odds Factor is FanDuel-only in our data (see
// matrixEngine.ts's own ODDS_BOOK_FIELD/MULTI_BOOK_MARKET). Labels match
// the exact book names DugoutClient already shows columns for.
export const MULTI_BOOK_FIELDS: Record<string, { key: string; label: string }[]> = {
  fhr: [
    { key: 'fanduel', label: 'FanDuel' }, { key: 'caesars', label: 'Caesars' }, { key: 'fanatics', label: 'Fanatics' },
  ],
  hr: [
    { key: 'fanduel', label: 'FanDuel' }, { key: 'caesars', label: 'Caesars' }, { key: 'betmgm', label: 'BetMGM' },
    { key: 'betrivers', label: 'BetRivers' }, { key: 'fanatics', label: 'Fanatics' },
  ],
}

export async function api<T>(url: string, opts?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts?.headers || {}) } })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: json?.error || 'Something went wrong.' }
    return { data: json, error: null }
  } catch {
    return { data: null, error: 'Network error — try again.' }
  }
}

export const ALL_CATEGORIES = ['odds', 'dugout_specs', 'pitchlog_stat', 'savant_stat', 'picks'] as const

function FactorRow({ factor, onChange, onRemove, dragControls }: { factor: MatrixFactor; onChange: (f: MatrixFactor) => void; onRemove: () => void; dragControls?: DragControls }) {
  const fields = fieldsForCategory(factor.category)
  const isBooksField = factor.field_key === 'booksfhr' || factor.field_key === 'bookshr'
  // No threshold VALUE needed for any of these — odds' delta-vs-open trio,
  // dugout_specs' plain sign check (a Factor like "FHR% is positive"
  // doesn't want a number typed in, same shape as "moved up since open"),
  // or 'tied' (a real-time comparison against teammates, not a number a
  // member picks — see evaluateOddsFactor/evaluateDugoutSpecsFactor).
  const hidesValue = (factor.category === 'odds' && ['up', 'down', 'flat', 'up_or_flat', 'down_or_flat'].includes(factor.operator))
    || factor.operator === 'positive' || factor.operator === 'negative' || factor.operator === 'zero' || factor.operator === 'tied'
    || factor.operator === 'is_null' || factor.operator === 'is_not_null' || factor.operator === 'mm_trend'
  // 'mm_trend' spans all 4 windows itself (see MmTrendFields below) — the
  // plain recency picker is meaningless once that operator is selected.
  const needsRecency = (factor.category === 'pitchlog_stat' || factor.category === 'savant_stat' || (factor.category === 'dugout_specs' && ['mm', 'bk_rk', 'pp_rk'].includes(factor.field_key)))
    && factor.operator !== 'mm_trend'
  // Real gap, reported live (2026-07-27): 'positive'/'negative' was gated to
  // dugout_specs only, but a pitchlog_stat/savant_stat field on a '_delta'
  // recency (Bat Speed/Squared-Up%, the only two with one — see
  // DELTA_DISPLAYED_FIELDS) is JUST as signed a value (recent minus season)
  // — "did it speed up or slow down" is exactly a positive/negative
  // question, not a "type in the right number" one.
  const isDeltaRecency = typeof factor.recency === 'string' && factor.recency.endsWith('_delta')
  // "Is PWR ⚡?" — a real Yes/No gate (buildBatterRow's is_pwr), not a ratio
  // to type a number for. Represented under the hood as an ordinary eq-1/
  // eq-0 Factor (see matrixEngine.ts) so it reuses the same evaluation path
  // as every other Dugout Specs field, just with its own picker in place of
  // the usual operator+value inputs.
  const isBoolean = fields.find(f => f.key === factor.field_key)?.boolean === true

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div
        onPointerDown={e => dragControls?.start(e)}
        style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', cursor: dragControls ? 'grab' : 'default', touchAction: 'none' }}
      >
        <GripVertical size={14} />
      </div>

      <select
        className="ss-input" value={factor.category}
        onChange={e => {
          const category = e.target.value as MatrixFactor['category']
          const firstField = fieldsForCategory(category)[0]
          onChange({
            ...factor, category, field_key: firstField.key,
            operator: firstField.boolean ? 'eq' : 'gte', value: firstField.boolean ? 1 : null,
            recency: category === 'pitchlog_stat' || category === 'savant_stat' ? 'season' : null,
          })
        }}
        style={{ fontSize: 11, padding: '5px 6px', width: 110 }}
      >
        {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select>

      <select
        className="ss-input" value={factor.field_key}
        onChange={e => {
          const field_key = e.target.value
          const nowBoolean = fields.find(f => f.key === field_key)?.boolean === true
          onChange({
            ...factor, field_key,
            ...(isBooksFieldKey(field_key) ? { operator: 'gte' } : {}),
            ...(nowBoolean ? { operator: 'eq', value: 1 } : isBoolean ? { operator: 'gte', value: null } : {}),
            // 'mm_trend' is only ever offered for field_key 'mm' — switching
            // away from it resets to a plain threshold rather than leaving
            // the Factor in an operator/field combo the UI never offers.
            ...(factor.operator === 'mm_trend' && field_key !== 'mm' ? { operator: 'gte' as const, value: null } : {}),
            // Switching TO 'mm_move' needs its own base/compare windows to
            // be usable immediately, same default pair mm_trend seeds.
            ...(field_key === 'mm_move' && !factor.mm_base_window ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const } : {}),
          })
        }}
        style={{ fontSize: 11, padding: '5px 6px', minWidth: 150, flex: '1 1 150px' }}
      >
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {factor.field_key === 'mm_move' && (
        <MmMoveWindowPicker
          baseWindow={factor.mm_base_window} compareWindows={factor.mm_compare_windows}
          onPatch={patch => onChange({ ...factor, ...patch })}
        />
      )}

      {isBoolean ? (
        <select
          className="ss-input" value={factor.value === 0 ? '0' : '1'}
          onChange={e => onChange({ ...factor, operator: 'eq', value: Number(e.target.value) })}
          style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
        >
          <option value="1">Yes</option>
          <option value="0">No</option>
        </select>
      ) : (
        <>
          <select
            className="ss-input" value={factor.operator}
            onChange={e => {
              const operator = e.target.value as MatrixFactor['operator']
              onChange({
                ...factor, operator,
                ...(operator === 'mm_trend' && !factor.mm_base_window
                  ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const, mm_direction: 'decreased' as const, mm_match_mode: null, mm_amount_mode: null }
                  : {}),
              })
            }}
            style={{ fontSize: 11, padding: '5px 6px', width: 170 }}
          >
            <option value="gte">{OPERATOR_LABEL.gte}</option>
            <option value="lte">{OPERATOR_LABEL.lte}</option>
            <option value="eq">{OPERATOR_LABEL.eq}</option>
            {!isBooksField && (
              <>
                <option value="is_null">{OPERATOR_LABEL.is_null}</option>
                <option value="is_not_null">{OPERATOR_LABEL.is_not_null}</option>
              </>
            )}
            {factor.category === 'odds' && !isBooksField && (
              <>
                <option value="up">{OPERATOR_LABEL.up}</option>
                <option value="down">{OPERATOR_LABEL.down}</option>
                <option value="flat">{OPERATOR_LABEL.flat}</option>
                <option value="up_or_flat">{OPERATOR_LABEL.up_or_flat}</option>
                <option value="down_or_flat">{OPERATOR_LABEL.down_or_flat}</option>
                <option value="tied">{OPERATOR_LABEL.tied}</option>
              </>
            )}
            {factor.category === 'dugout_specs' && (
              <>
                <option value="positive">{OPERATOR_LABEL.positive}</option>
                <option value="negative">{OPERATOR_LABEL.negative}</option>
                <option value="zero">{OPERATOR_LABEL.zero}</option>
                <option value="tied">{OPERATOR_LABEL.tied}</option>
                {factor.field_key === 'mm' && <option value="mm_trend">{OPERATOR_LABEL.mm_trend}</option>}
              </>
            )}
            {factor.category !== 'dugout_specs' && isDeltaRecency && (
              <>
                <option value="positive">{OPERATOR_LABEL.positive}</option>
                <option value="negative">{OPERATOR_LABEL.negative}</option>
                <option value="zero">{OPERATOR_LABEL.zero}</option>
              </>
            )}
          </select>

          {factor.operator === 'mm_trend' && (
            <MmTrendFields
              baseWindow={factor.mm_base_window} compareWindows={factor.mm_compare_windows}
              direction={factor.mm_direction} amount={factor.value} matchMode={factor.mm_match_mode}
              amountMode={factor.mm_amount_mode}
              onPatch={patch => onChange({ ...factor, ...patch })}
            />
          )}

          {factor.operator === 'tied' ? (
            <>
              <select
                className="ss-input" value={factor.tie_scope ?? 'team'}
                onChange={e => onChange({ ...factor, tie_scope: e.target.value as MatrixFactor['tie_scope'] })}
                style={{ fontSize: 11, padding: '5px 6px', width: 130 }}
              >
                <option value="team">Same team</option>
                <option value="game">Either team</option>
              </select>
              <select
                className="ss-input" value={factor.tie_direction ?? 'all'}
                onChange={e => onChange({ ...factor, tie_direction: e.target.value === 'all' ? null : e.target.value as MatrixFactor['tie_direction'] })}
                title="When more than one pair/group ties at different values, which one to keep"
                style={{ fontSize: 11, padding: '5px 6px', width: 170 }}
              >
                <option value="all">Keep every tied group</option>
                <option value="highest">Keep the highest-tied group</option>
                <option value="lowest">Keep the lowest-tied group</option>
              </select>
            </>
          ) : !hidesValue && (
            <input
              className="ss-input" type="number" placeholder={isBooksField ? 'books missing' : 'value'}
              value={factor.value ?? ''}
              onChange={e => onChange({ ...factor, value: e.target.value === '' ? null : Number(e.target.value) })}
              style={{ fontSize: 11, padding: '5px 6px', width: 84 }}
            />
          )}
        </>
      )}

      {needsRecency && (
        <select
          className="ss-input" value={factor.recency ?? 'season'}
          onChange={e => {
            const recency = e.target.value as MatrixFactor['recency']
            const stillDelta = typeof recency === 'string' && recency.endsWith('_delta')
            onChange({
              ...factor, recency,
              // 'positive'/'negative' outside dugout_specs is only offered
              // for a '_delta' recency (see isDeltaRecency above) — leaving
              // one selected while switching to a non-delta window would
              // strand the Factor on an operator its own dropdown no longer
              // shows, same class of fix as the mm_trend field-switch reset.
              ...((factor.operator === 'positive' || factor.operator === 'negative' || factor.operator === 'zero') && factor.category !== 'dugout_specs' && !stillDelta
                ? { operator: 'gte' as const, value: null }
                : {}),
            })
          }}
          title="Every window here (even Season) only counts games against whichever pitcher hand this player's real opponent throws on the day being evaluated — not every game he's played, full stop"
          style={{ fontSize: 11, padding: '5px 6px', width: 100 }}
        >
          {/* 'custom' (an arbitrary exact date range) removed for pitchlog_stat
              (2026-07-24) — it was the one recency choice the daily precompute
              can't cover, meaning it forced a live per-batter raw-pitch fetch
              on every request for whichever member picked it (confirmed live:
              the exact cause of the 28-56s Dugout load spikes). Every fixed
              window is precomputed for every category now, same as
              savant_stat already was.

              '_delta' options (recent minus season) removed from this list
              (2026-07-24) for most fields — the board never actually displays
              that computed delta anywhere for them, only the raw season value
              and whichever recent window is currently toggled, so a member
              had no real number to calibrate a delta threshold against.
              Restored (2026-07-25) for the two fields that DO have a real
              displayed delta — Bat Speed (ΔSPD) and Squared-Up% (ΔSQ) — see
              recencyOptionsFor/DELTA_DISPLAYED_FIELDS above. The engine
              always supported '*_delta' regardless of what the picker
              offered. */}
          {recencyOptionsFor(factor.category, factor.field_key).map(r => (
            <option key={r} value={r}>{recencyLabel(factor.category, r)}</option>
          ))}
        </select>
      )}

      <button onClick={onRemove} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
        <X size={14} />
      </button>

      {/* FHR/Anytime HR are the only two Factor fields with real prices from
          more than one book — everything else in this app is FanDuel-only.
          Defaults to FanDuel alone (identical to before this existed) until
          a member picks otherwise. */}
      {factor.category === 'odds' && MULTI_BOOK_FIELDS[factor.field_key] && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, width: '100%', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>BOOKS</span>
          {MULTI_BOOK_FIELDS[factor.field_key].map(b => {
            const selected = factor.books?.length ? factor.books : ['fanduel']
            const on = selected.includes(b.key)
            return (
              <button
                key={b.key} title={b.label}
                onClick={() => {
                  const next = on ? selected.filter(k => k !== b.key) : [...selected, b.key]
                  onChange({ ...factor, books: next.length ? next : ['fanduel'] })
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24,
                  padding: 0, borderRadius: 6, cursor: 'pointer',
                  background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, opacity: on ? 1 : 0.55,
                }}
              >
                <BookLogo vendor={b.key} size={14} />
              </button>
            )
          })}
          <select
            className="ss-input" value={factor.books_min_count == null ? 'all' : 'atLeast'}
            onChange={e => onChange({ ...factor, books_min_count: e.target.value === 'atLeast' ? (factor.books?.length ?? 1) : null })}
            style={{ fontSize: 10, padding: '4px 5px', width: 140, marginLeft: 'auto' }}
          >
            <option value="all">True for every book picked</option>
            <option value="atLeast">True for at least N picked</option>
          </select>
          {factor.books_min_count != null && (
            <input
              className="ss-input" type="number" min={1} max={(factor.books?.length ?? 1) || 1}
              value={factor.books_min_count}
              onChange={e => onChange({ ...factor, books_min_count: Math.max(1, Number(e.target.value) || 1) })}
              style={{ fontSize: 10, padding: '4px 5px', width: 44 }}
            />
          )}
        </div>
      )}

      {/* A tiebreaker chain narrows a raw tie group down to whoever ranks
          best on some other field — e.g. "of everyone tied on HR÷Parlay,
          keep only the highest recent Attack Angle." Each step only
          matters if the one before it still leaves more than one player
          tied (see resolveTiebreakers, matrixEngine.ts); if the whole
          chain runs out, everyone still tied stays highlighted. */}
      {factor.operator === 'tied' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.03em' }}>
            TIEBREAKER{factor.tiebreakers.length !== 1 ? 'S' : ''} — RANK TIED PLAYERS BY
          </span>
          {factor.tiebreakers.map((tb, i) => (
            <TiebreakerRow
              key={i} tb={tb}
              onChange={next => onChange({ ...factor, tiebreakers: factor.tiebreakers.map((t, j) => (j === i ? next : t)) })}
              onRemove={() => onChange({ ...factor, tiebreakers: factor.tiebreakers.filter((_, j) => j !== i) })}
            />
          ))}
          <button
            onClick={() => onChange({ ...factor, tiebreakers: [...factor.tiebreakers, newTiebreaker()] })}
            style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0', alignSelf: 'flex-start' }}
          >
            + Add {factor.tiebreakers.length ? 'fallback tiebreaker' : 'tiebreaker'}
          </button>
        </div>
      )}
    </div>
  )
}
export function isBooksFieldKey(k: string) { return k === 'booksfhr' || k === 'bookshr' }

// Own useDragControls() instance per row (hooks can't run in a loop) so
// dragging only starts from the grip handle, not the whole card — otherwise
// every dropdown/input inside FactorRow becomes a drag surface too.
function FactorListItem({ factor, onChange, onRemove }: { factor: MatrixFactor; onChange: (f: MatrixFactor) => void; onRemove: () => void }) {
  const dragControls = useDragControls()
  return (
    <Reorder.Item value={factor} as="div" dragListener={false} dragControls={dragControls} style={{ listStyle: 'none' }}>
      <FactorRow factor={factor} onChange={onChange} onRemove={onRemove} dragControls={dragControls} />
    </Reorder.Item>
  )
}

// One step of a 'tied' Factor's fallback chain — "of everyone still tied,
// keep only whoever ranks best on THIS field." Reuses the exact same
// category/field catalogs (and recency/book pickers) a plain Factor uses,
// so a member never has to learn a second vocabulary for ranking vs.
// thresholding — boolean fields (Is PWR ⚡?) are excluded since "highest
// Yes/No" is meaningless.
function TiebreakerRow({ tb, onChange, onRemove }: { tb: MatrixTiebreaker; onChange: (t: MatrixTiebreaker) => void; onRemove: () => void }) {
  const fields = fieldsForCategory(tb.category).filter(f => !f.boolean)
  const needsRecency = tb.category === 'pitchlog_stat' || tb.category === 'savant_stat' || (tb.category === 'dugout_specs' && ['mm', 'bk_rk', 'pp_rk'].includes(tb.field_key))
  const multiBook = tb.category === 'odds' ? MULTI_BOOK_FIELDS[tb.field_key] : null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <select
        className="ss-input" value={tb.category}
        onChange={e => {
          const category = e.target.value as MatrixTiebreaker['category']
          const firstField = fieldsForCategory(category).filter(f => !f.boolean)[0] ?? fieldsForCategory(category)[0]
          onChange({
            ...tb, category, field_key: firstField.key, book: null,
            recency: category === 'pitchlog_stat' || category === 'savant_stat' ? 'season' : null,
          })
        }}
        style={{ fontSize: 10, padding: '4px 5px', width: 100 }}
      >
        {ALL_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select>

      <select
        className="ss-input" value={tb.field_key}
        onChange={e => {
          const field_key = e.target.value
          onChange({
            ...tb, field_key, book: null,
            ...(field_key === 'mm_move' && !tb.mm_base_window ? { mm_base_window: 'l10' as const, mm_compare_windows: ['l1'] as const } : {}),
          })
        }}
        style={{ fontSize: 10, padding: '4px 5px', minWidth: 130, flex: '1 1 130px' }}
      >
        {fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select>

      {tb.field_key === 'mm_move' && (
        <MmMoveWindowPicker
          baseWindow={tb.mm_base_window} compareWindows={tb.mm_compare_windows}
          onPatch={patch => onChange({ ...tb, ...patch })}
        />
      )}

      {needsRecency && (
        <select
          className="ss-input" value={tb.recency ?? 'season'}
          onChange={e => onChange({ ...tb, recency: e.target.value as MatrixTiebreaker['recency'] })}
          title="Every window here (even Season) only counts games against whichever pitcher hand this player's real opponent throws on the day being evaluated — not every game he's played, full stop"
          style={{ fontSize: 10, padding: '4px 5px', width: 100 }}
        >
          {/* Same Bat Speed / Squared-Up% exception as FactorRow's own
              recency select — see recencyOptionsFor above. */}
          {recencyOptionsFor(tb.category, tb.field_key).map(r => (
            <option key={r} value={r}>{recencyLabel(tb.category, r)}</option>
          ))}
        </select>
      )}

      {multiBook && (
        <div style={{ display: 'flex', gap: 3 }}>
          {multiBook.map(b => {
            const on = (tb.book ?? 'fanduel') === b.key
            return (
              <button
                key={b.key} title={b.label} onClick={() => onChange({ ...tb, book: b.key })}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22,
                  padding: 0, borderRadius: 5, cursor: 'pointer',
                  background: on ? 'var(--accent-dim)' : 'var(--surface-3)',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, opacity: on ? 1 : 0.55,
                }}
              >
                <BookLogo vendor={b.key} size={12} />
              </button>
            )
          })}
        </div>
      )}

      <select
        className="ss-input" value={tb.direction}
        onChange={e => onChange({ ...tb, direction: e.target.value as MatrixTiebreaker['direction'] })}
        style={{ fontSize: 10, padding: '4px 5px', width: 120 }}
      >
        <option value="highest">Highest</option>
        <option value="lowest">Lowest</option>
        <option value="closest_zero">Closest to 0</option>
        <option value="farthest_zero">Farthest from 0</option>
      </select>

      {tb.direction === 'closest_zero' && (
        <label
          title="Off (default): a literal 0 never wins — right for a field like DIV where 0 usually means no line/no data. On: 0 competes and can win — right for a field like MM where 0 is a real 'no movement' reading."
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          <input
            type="checkbox" checked={tb.zero_eligible === true}
            onChange={e => onChange({ ...tb, zero_eligible: e.target.checked })}
          />
          0 can win
        </label>
      )}

      <input
        type="number" min={0} step={0.01} className="ss-input"
        placeholder="± tolerance"
        title="Also keep anyone within this amount of the best value (e.g. 0.02) — leave blank for an exact match only"
        value={tb.tolerance ?? ''}
        onChange={e => onChange({ ...tb, tolerance: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
        style={{ fontSize: 10, padding: '4px 5px', width: 80 }}
      />

      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2 }}>
        <X size={12} />
      </button>
    </div>
  )
}

function MatrixEditor({ initial, onClose, onSaved }: { initial: MatrixDef | null; onClose: () => void; onSaved: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [color, setColor] = useState(initial?.color ?? SWATCHES[0])
  const [matchMode, setMatchMode] = useState<'all' | 'any'>(initial?.match_mode ?? 'all')
  const [matchAnyCount, setMatchAnyCount] = useState(initial?.match_any_count ?? 2)
  const [factors, setFactors] = useState<MatrixFactor[]>(initial?.factors?.length ? initial.factors : [newFactor()])
  // Mode is fixed once a Matrix exists — only choosable while creating new,
  // so a member never lands in a half-migrated state (Factors that used to
  // exist silently vanishing, or vice versa).
  const [matrixType, setMatrixType] = useState<'classic' | 'pipeline'>(initial?.matrix_type ?? 'classic')
  const [pipelineScope, setPipelineScope] = useState<'team' | 'game'>(initial?.pipeline_scope ?? 'team')
  const [pipelineSteps, setPipelineSteps] = useState<MatrixPipelineStep[]>(initial?.pipeline_steps ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const body = document.body
    const scrollY = window.scrollY
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    }

    document.body.classList.add('ss-modal-open')
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    dialogRef.current?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      body.classList.remove('ss-modal-open')
      body.style.overflow = previousStyles.overflow
      body.style.position = previousStyles.position
      body.style.top = previousStyles.top
      body.style.width = previousStyles.width
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
      trigger?.focus({ preventScroll: true })
    }
  }, [onClose])

  const save = useCallback(async () => {
    if (!name.trim()) { setError('Give this Matrix a name.'); return }
    if (matrixType === 'pipeline') {
      if (!pipelineSteps.length) { setError('A Pipeline needs at least one step.'); return }
    } else if (!factors.length) {
      setError('A Matrix needs at least one Factor.'); return
    }
    setSaving(true); setError(null)
    const body = matrixType === 'pipeline'
      ? { name: name.trim(), color, matrix_type: 'pipeline', pipeline_scope: pipelineScope, pipeline_steps: pipelineSteps }
      : { name: name.trim(), color, matrix_type: 'classic', match_mode: matchMode, match_any_count: matchMode === 'any' ? matchAnyCount : null, factors }
    const { error: err } = initial
      ? await api(`/api/matrices/${initial.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      : await api('/api/matrices', { method: 'POST', body: JSON.stringify(body) })
    setSaving(false)
    if (err) { setError(err); return }
    onSaved()
  }, [name, color, matrixType, matchMode, matchAnyCount, factors, pipelineScope, pipelineSteps, initial, onSaved])

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      <style>{`
        .matrix-editor-backdrop {
          align-items: center;
          background: rgba(0, 0, 0, 0.72);
          display: flex;
          inset: 0;
          justify-content: center;
          overscroll-behavior: contain;
          padding: 16px;
          position: fixed;
          z-index: calc(var(--layer-critical, 900) + 100);
        }
        .matrix-editor-dialog {
          -webkit-overflow-scrolling: touch;
          background: var(--bg);
          border: 1px solid var(--border-2);
          border-radius: 16px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.58);
          max-height: min(88dvh, 900px);
          overscroll-behavior: contain;
          overflow-y: auto;
          padding: 18px;
        }
        @media (max-width: 767px), (max-width: 1024px) and (any-pointer: coarse) {
          .matrix-editor-backdrop {
            align-items: flex-end;
            padding: max(8px, env(safe-area-inset-top, 0px)) 0 0;
          }
          .matrix-editor-dialog {
            border-bottom: 0;
            border-radius: 22px 22px 0 0;
            max-height: calc(100dvh - max(8px, env(safe-area-inset-top, 0px)));
            padding: 16px 14px max(20px, env(safe-area-inset-bottom, 0px));
            width: 100% !important;
          }
        }
      `}</style>
      <div className="matrix-editor-backdrop" onClick={onClose}>
        <div
          aria-labelledby="matrix-editor-title"
          aria-modal="true"
          className="matrix-editor-dialog"
          onClick={e => e.stopPropagation()}
          ref={dialogRef}
          role="dialog"
          style={{ width: matrixType === 'pipeline' ? 'min(640px, 100%)' : 'min(520px, 100%)' }}
          tabIndex={-1}
        >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span id="matrix-editor-title" style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{initial ? 'Edit Matrix' : 'New Matrix'}</span>
          <button aria-label="Close Matrix editor" onClick={onClose} type="button" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>

        {!initial && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, padding: 3, background: 'var(--surface-2)', borderRadius: 9 }}>
            {(['classic', 'pipeline'] as const).map(t => (
              <button
                key={t} onClick={() => setMatrixType(t)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '7px 8px',
                  borderRadius: 7, border: 'none', cursor: 'pointer',
                  background: matrixType === t ? 'var(--surface)' : 'none',
                  boxShadow: matrixType === t ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800, color: matrixType === t ? 'var(--accent)' : 'var(--text-2)' }}>
                  {t === 'classic' ? 'Classic' : 'Pipeline'}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                  {t === 'classic' ? 'All Elements must match' : 'A step-by-step narrowing chain'}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="ss-input" placeholder="Matrix name" value={name} onChange={e => setName(e.target.value)}
            style={{ flex: 1, fontSize: 13, padding: '8px 10px' }}
          />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {SWATCHES.map(c => (
              <button
                key={c} onClick={() => setColor(c)}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '2px solid var(--text-1)' : '2px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        {matrixType === 'pipeline' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-2)' }}>
              Compare players on
              <select className="ss-input" value={pipelineScope} onChange={e => setPipelineScope(e.target.value as 'team' | 'game')} style={{ fontSize: 12, padding: '5px 6px' }}>
                <option value="team">the same team</option>
                <option value="game">either team</option>
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <PipelineSummary steps={pipelineSteps} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <PipelineBuilder steps={pipelineSteps} onChange={setPipelineSteps} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, color: 'var(--text-2)' }}>
              Highlight when a batter meets
              <select className="ss-input" value={matchMode} onChange={e => setMatchMode(e.target.value as 'all' | 'any')} style={{ fontSize: 12, padding: '5px 6px' }}>
                <option value="all">every Element</option>
                <option value="any">at least</option>
              </select>
              {matchMode === 'any' && (
                <input
                  className="ss-input" type="number" min={1} max={factors.length || 1} value={matchAnyCount}
                  onChange={e => setMatchAnyCount(Math.max(1, Number(e.target.value) || 1))}
                  style={{ fontSize: 12, padding: '5px 6px', width: 50 }}
                />
              )}
              {matchMode === 'any' && 'Elements'}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>Elements ({factors.length})</span>
              <button
                onClick={() => setFactors([...factors, newFactor()])}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700,
                  color: 'var(--accent)', background: 'var(--accent-dim)', border: 'none', borderRadius: 6, padding: '5px 9px', cursor: 'pointer',
                }}
              >
                <Plus size={12} /> Add Factor
              </button>
            </div>

            <Reorder.Group
              axis="y" values={factors} onReorder={setFactors} as="div"
              style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, listStyle: 'none', padding: 0, margin: '0 0 14px' }}
            >
              {factors.map((f, i) => (
                <FactorListItem
                  key={i} factor={f}
                  onChange={nf => setFactors(factors.map((x, xi) => xi === i ? nf : x))}
                  onRemove={() => setFactors(factors.filter((_, xi) => xi !== i))}
                />
              ))}
            </Reorder.Group>
          </>
        )}

        {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} className="ss-btn-ghost" style={{ flex: 1, padding: '9px 0', fontSize: 12 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="ss-btn-accent" style={{ flex: 1, padding: '9px 0', fontSize: 12, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Matrix'}
          </button>
        </div>
        </div>
      </div>
    </>,
    document.body,
  )
}

function MatrixCard({ matrix, onEdit, onDeleted, onToggled, onShare }: { matrix: MatrixDef; onEdit: () => void; onDeleted: () => void; onToggled: () => void; onShare: () => void }) {
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const { confirm } = useFeedback()

  const copyCode = useCallback(() => {
    navigator.clipboard?.writeText(matrix.element_code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [matrix.element_code])

  const del = useCallback(async () => {
    if (!await confirm({ title: 'Delete Matrix?', message: `"${matrix.name}" will be permanently removed.`, confirmLabel: 'Delete Matrix', tone: 'error' })) return
    setDeleting(true)
    await api(`/api/matrices/${matrix.id}`, { method: 'DELETE' })
    onDeleted()
  }, [confirm, matrix, onDeleted])

  // A cheap single-field PATCH — omitting `factors` from the body entirely
  // skips the delete-and-reinsert Factor path (see /api/matrices/[id]),
  // so toggling never touches matrix_factors.
  const toggle = useCallback(async () => {
    setToggling(true)
    await api(`/api/matrices/${matrix.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !matrix.enabled }) })
    setToggling(false)
    onToggled()
  }, [matrix, onToggled])

  return (
    <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, opacity: deleting ? 0.5 : matrix.enabled ? 1 : 0.55 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: matrix.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matrix.name}</span>
        {matrix.matrix_type === 'pipeline' && (
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.03em', color: 'var(--blue)', background: 'var(--blue-dim)', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>
            PIPELINE
          </span>
        )}
        <span style={{ flex: 1, minWidth: 4 }} />
        <button
          onClick={toggle} disabled={toggling} title={matrix.enabled ? 'On — showing on the board. Click to turn off.' : 'Off — saved but not shown. Click to turn on.'}
          style={{
            position: 'relative', width: 30, height: 17, borderRadius: 9, flexShrink: 0, cursor: toggling ? 'default' : 'pointer',
            border: 'none', padding: 0, background: matrix.enabled ? 'var(--accent)' : 'var(--surface-3, var(--border))',
            opacity: toggling ? 0.6 : 1, transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: matrix.enabled ? 15 : 2, width: 13, height: 13, borderRadius: '50%',
            background: '#fff', transition: 'left 0.15s',
          }} />
        </button>
        <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Pencil size={13} /></button>
        <button onClick={del} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}><Trash2 size={13} /></button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
        {matrix.matrix_type === 'pipeline'
          ? <>{matrix.pipeline_steps.length} step{matrix.pipeline_steps.length === 1 ? '' : 's'} · {matrix.pipeline_scope === 'game' ? 'either team' : 'same team'}</>
          : <>{matrix.factors.length} Element{matrix.factors.length === 1 ? '' : 's'} · {matrix.match_mode === 'all' ? 'match all' : `match ${matrix.match_any_count ?? 1}+`}</>
        }
        {!matrix.enabled && <> · <span style={{ color: 'var(--text-3)' }}>off</span></>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 10, fontFamily: "'SF Mono',monospace", color: 'var(--text-2)', background: 'var(--surface-2)', padding: '3px 7px', borderRadius: 5, letterSpacing: '0.03em' }}>
          {matrix.element_code}
        </span>
        <button onClick={copyCode} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: copied ? 'var(--accent)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button onClick={onShare} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRadius: 6, cursor: 'pointer', padding: '4px 7px' }}>
          <Share2 size={11} /> Share
        </button>
      </div>
    </div>
  )
}

export function MatrixButton() {
  const { user, profile } = useAuth()
  const router = useRouter()
  const fab = useDraggableFab('matrix-fab-pos')
  const [open, setOpen] = useState(false)
  const [matrices, setMatrices] = useState<MatrixDef[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<MatrixDef | null | undefined>(undefined) // undefined = closed, null = new
  const [importCode, setImportCode] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const profileTier = effectiveTier(
    (profile?.tier as Tier | undefined) ?? 'free',
    profile?.discord_advanced_claimed,
    profile?.admin_granted_tier as Tier | null | undefined,
  )
  const hasUltimate = !!profile && (
    hasFullAccessOverride(profile.account_type, profile.beta_access_active)
    || hasTierAccess(profileTier, 'ultimate')
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data } = await api<{ matrices: MatrixDef[] }>('/api/matrices')
    setMatrices(data?.matrices ?? [])
    setLoading(false)
  }, [])

  // Real gap (2026-07-24): this panel is mounted globally (RootLayoutShell),
  // fully decoupled from whatever page happens to be open — a page like
  // Dugout that renders Matrix-highlighted data has no direct parent/child
  // link through which to hear "the member's Matrix set just changed."
  // Confirmed live: saving/importing/deleting a Matrix never updated an
  // already-open Dugout tab at all — the member had to manually reload to
  // see it reflected, since /api/dugout/data (where matrixMatches are
  // actually computed) only ever re-fetches on date change. Broadcasting a
  // plain window event here lets any listening page (see DugoutClient.tsx)
  // refetch immediately instead.
  const notifyMatricesChanged = useCallback(() => {
    window.dispatchEvent(new Event('ss:matrices-updated'))
  }, [])

  const closeEditor = useCallback(() => setEditing(undefined), [])
  const handleEditorSaved = useCallback(() => {
    setEditing(undefined)
    refresh()
    notifyMatricesChanged()
  }, [refresh, notifyMatricesChanged])

  useEffect(() => {
    if (user && hasUltimate) refresh()
  }, [user, hasUltimate, refresh])

  const doImport = useCallback(async () => {
    if (!importCode.trim()) return
    setImporting(true); setImportError(null)
    const { error } = await api('/api/matrices/import', { method: 'POST', body: JSON.stringify({ element_code: importCode.trim() }) })
    setImporting(false)
    if (error) { setImportError(error); return }
    setImportCode('')
    refresh()
    notifyMatricesChanged()
  }, [importCode, refresh, notifyMatricesChanged])

  if (!user || !hasUltimate) return null

  return (
    <>
      <style>{`.matrix-fab { position: fixed; right: 20px; bottom: calc(136px + env(safe-area-inset-bottom, 0px)); z-index: 50; } @media (max-width: 767px), (max-width: 1024px) and (any-pointer: coarse) { .matrix-fab { bottom: calc(204px + env(safe-area-inset-bottom, 0px)); } }`}</style>
      <button
        ref={fab.ref} className="matrix-fab" title="Drag to move" onClick={() => setOpen(true)} {...fab.handlers}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 999,
          background: 'var(--surface)', color: 'var(--text-1)', border: '1px solid var(--border-2)', cursor: 'grab',
          fontSize: 13, fontWeight: 800, boxShadow: '0 4px 16px rgba(0,0,0,0.35)', userSelect: 'none', ...fab.style,
        }}
      >
        <Grid3x3 size={15} /> Matrix
        {matrices.length > 0 && (
          <span style={{ background: 'var(--accent-dim)', color: 'var(--accent)', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{matrices.length}</span>
        )}
      </button>

      <ModalSurface
        open={open}
        onClose={() => setOpen(false)}
        labelledBy="custom-matrix-panel-title"
        backdropStyle={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 'var(--layer-modal)', display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(6px)' }}
        panelStyle={{
          width: 'min(420px, 100vw)', height: '100%', background: 'var(--bg)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', animation: 'slideIn 0.2s ease-out', outline: 'none',
        }}
      >
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <span id="custom-matrix-panel-title" style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Grid3x3 size={16} /> Custom Matrix
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{matrices.length}/10</span>
              <button type="button" data-modal-autofocus aria-label="Close custom matrix" onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
              <button
                onClick={() => setEditing(null)}
                disabled={matrices.length >= 10}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', marginBottom: 12, borderRadius: 8, fontSize: 12, fontWeight: 800,
                  color: matrices.length >= 10 ? 'var(--text-3)' : 'var(--accent-fg)',
                  background: matrices.length >= 10 ? 'var(--surface-2)' : 'var(--accent)',
                  border: 'none', cursor: matrices.length >= 10 ? 'not-allowed' : 'pointer',
                }}
              >
                <Plus size={14} /> New Matrix
              </button>

              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>Loading…</div>
              ) : matrices.length === 0 ? (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  No Matrices saved yet.<br />Build one to auto-highlight batters who meet your own criteria.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {matrices.map(m => (
                    <MatrixCard
                      key={m.id} matrix={m} onEdit={() => setEditing(m)}
                      onDeleted={() => { refresh(); notifyMatricesChanged() }}
                      onToggled={() => { refresh(); notifyMatricesChanged() }}
                      onShare={() => router.push(`/marketplace?share=${encodeURIComponent(m.id)}`)}
                    />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <button onClick={() => router.push('/marketplace')} className="ss-btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, padding: '8px 12px', marginBottom: 12, color: 'var(--accent)' }}>
                  <ShoppingBag size={13} /> Browse Matrix Marketplace
                </button>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }}>Import a shared Element Code</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    className="ss-input" placeholder="EL-XXXX-XXXX" value={importCode}
                    onChange={e => setImportCode(e.target.value.toUpperCase())}
                    style={{ flex: 1, fontSize: 11, padding: '7px 8px', fontFamily: "'SF Mono',monospace" }}
                  />
                  <button onClick={doImport} disabled={importing || matrices.length >= 10} className="ss-btn-ghost" style={{ fontSize: 11, padding: '7px 12px' }}>
                    {importing ? '…' : 'Import'}
                  </button>
                </div>
                {importError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{importError}</div>}
              </div>
            </div>
      </ModalSurface>

      {editing !== undefined && (
        <MatrixEditor
          initial={editing}
          onClose={closeEditor}
          onSaved={handleEditorSaved}
        />
      )}
    </>
  )
}
