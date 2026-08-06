import { fetchHistoricalGameBundles } from '../src/lib/matrixBacktest'
import { createAdminClient } from '../src/lib/supabase/admin'
import { computeMmByWindowForGame, buildPitcherMap, type MmPlayerInput } from '../src/lib/dugoutPaperScore'
import { computeDugoutSpecsValue, type FieldBundle, type OddsProps } from '@slipsurge/core/matrixEngine'
import { normName } from '@slipsurge/core/nameNorm'

// Outcome-blind pathway/dominance report.  KNOWN_HR is consulted only after
// selection, when the report grades the frozen shortlist.
const DATE = process.argv[2] ?? '2026-08-06'
const TARGET_GAME_PKS = new Set([824804, 824481, 824401])
const KNOWN_HR = new Set([
  'zach neto', 'yohel pozo',
  'elly de la cruz', 'sal stewart', 'jj bleday', 'tyler stephenson', 'brian serven',
  'marcus semien', 'luis torrens', 'nathaniel lowe', 'francisco lindor',
].map(normName))

type W = 'l10' | 'l5' | 'l3' | 'l1'
type Path = 'override' | 'shock' | 'sequence' | 'correlated' | 'paper' | 'acceleration'
type Row = {
  name: string; team: string; gamePk: number; order: number; bundle: FieldBundle
  mm: Record<W, number | null>; paperRank: Record<W, number | null>
  fhrPct: number | null; hrPct: number | null; picks: number
  raw: Record<Path, number>; pct: Record<Path, number>; selected: boolean; reasons: string[]
}

const admin = createAdminClient()
const implied = (o: number | null | undefined) => o == null ? null : o > 0 ? 100 / (o + 100) : -o / (-o + 100)
const ratio = (a: number | null | undefined, b: number | null | undefined) => {
  const x = implied(a), y = implied(b); return x != null && y != null && y > 0 ? x / y : null
}
const mean = (xs: Array<number | null | undefined>) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0
}
const pos = (x: number) => Math.max(0, x)
const pctRank = (x: number, all: number[]) => all.length < 2 ? 1 : all.filter(v => v <= x).length / all.length

async function pitcherMapFor(ids: number[], date: string) {
  const rows: any[] = []
  await Promise.all(ids.map(async id => {
    const { data } = await admin.from('player_pitch_log').select('pitch_type,stand').eq('pitcher_id', id).lt('game_date', date).range(0, 4999)
    for (const hand of ['L', 'R']) {
      const h = (data ?? []).filter((r: any) => r.stand === hand && r.pitch_type)
      const n = h.length || 1
      const count = (pt: string) => 100 * h.filter((r: any) => r.pitch_type === pt).length / n
      rows.push({ mlb_id: id, bat_hand: hand, win: 'season', pct_fastball: count('FF'), pct_sinker: count('SI'), pct_cutter: count('FC'), pct_slider: count('SL'), pct_curveball: count('CU'), pct_changeup: count('CH'), pct_splitter: count('FS') })
    }
  }))
  return buildPitcherMap(rows)
}

function componentAcceleration(b: FieldBundle): number {
  const sw: any = b.statcastWindows ?? {}
  const season: any = sw.season ?? {}
  const fields = ['avgBatSpeed', 'barrelPct', 'hardHitPct', 'pullAirRate', 'fbRate', 'avgEv', 'squaredUpPct', 'blastPct']
  const windows: W[] = ['l10', 'l5', 'l3', 'l1']
  const deltas: number[] = []
  for (const w of windows) for (const f of fields) {
    const recent = sw[w]?.[f], base = season?.[f]
    if (recent == null || base == null) continue
    const scale = Math.max(Math.abs(base), f === 'avgEv' || f === 'avgBatSpeed' ? 5 : 0.05)
    deltas.push((recent - base) / scale)
  }
  deltas.sort((a, b) => b - a)
  return mean(deltas.slice(0, Math.max(3, Math.ceil(deltas.length * 0.3))))
}

function correlatedCompression(p: OddsProps | null | undefined): number {
  if (!p?.sa?.fanduel) return 0
  // Larger HR/automatic-cash ratios mean the HR branch is expensive relative
  // to the easier outcome it necessarily clears.  HR/ML is reversed: a low
  // ratio means adding the team-win condition costs unusually little.
  const auto = [p.rbi?.fanduel, p.rbi2?.fanduel, p.rbi3?.fanduel, p.hrr?.fanduel, p.tb?.fanduel, p.tb3?.fanduel, p.tb4?.fanduel, p.tb5?.fanduel]
    .map(o => ratio(p.sa?.fanduel, o)).filter((x): x is number => x != null)
  const hrml = ratio(p.sa?.fanduel, p.hrMl?.fanduel)
  return mean(auto) + (hrml == null ? 0 : 0.5 / hrml)
}

async function main() {
  const bundles = (await fetchHistoricalGameBundles(DATE)).filter(b => DATE !== '2026-08-06' || TARGET_GAME_PKS.has(b.game.gamePk))
  const pitcherIds = [...new Set(bundles.flatMap(b => [b.game.homePitcher?.id, b.game.awayPitcher?.id]).filter((x): x is number => !!x))]
  const [pitcherMap, matchupRows] = await Promise.all([
    pitcherMapFor(pitcherIds, DATE),
    admin.from('dugout_matchup_edge_precomputed').select('mlb_id,role,data').eq('game_date', DATE).then(r => r.data ?? []),
  ])
  const batterEdge: Record<number, any> = {}, pitcherEdge: Record<number, any> = {}
  for (const r of matchupRows as any[]) (r.role === 'batter' ? batterEdge : pitcherEdge)[r.mlb_id] = r.data

  for (const gb of bundles) {
    if (!gb.game.homeLineupConfirmed || !gb.game.awayLineupConfirmed) continue
    const all = [...gb.game.awayLineup.map(p => ({ p, team: gb.game.awayAbbr, map: gb.awayBundle, pit: gb.game.homePitcher, hand: gb.game.homePitcher?.hand ?? 'R' })),
      ...gb.game.homeLineup.map(p => ({ p, team: gb.game.homeAbbr, map: gb.homeBundle, pit: gb.game.awayPitcher, hand: gb.game.awayPitcher?.hand ?? 'R' }))]
    const inputs: MmPlayerInput[] = all.map(x => {
      const b = x.map.get(normName(x.p.name))
      return { mlbId: x.p.mlb_id, effectiveBats: x.p.bats === 'L' || x.p.bats === 'S' ? 'L' : 'R', pitcherHand: x.hand as 'L' | 'R', pitcherId: x.pit?.id ?? null, saFd: b?.props?.sa?.fanduel ?? null, statcastWindows: b?.statcastWindows as any, batterMatchupData: batterEdge[x.p.mlb_id] ?? null }
    })
    const ranked = computeMmByWindowForGame(inputs, pitcherMap, pitcherEdge)
    const rows: Row[] = all.map(x => {
      const b = x.map.get(normName(x.p.name))!
      const p = b?.props
      const fhrPct = computeDugoutSpecsValue('fhr_pct', p, b?.fhrAvg, b?.saAvg)
      const hrPct = computeDugoutSpecsValue('sa_pct', p, b?.fhrAvg, b?.saAvg)
      const mm = ranked.mm[x.p.mlb_id] as Record<W, number | null>
      const pr = ranked.ppRk[x.p.mlb_id] as Record<W, number | null>
      const mmVals = (['l10','l5','l3','l1'] as W[]).map(w => mm[w])
      const paperRanks = (['l10','l5','l3','l1'] as W[]).map(w => pr[w])
      const fhrSa = ratio(p?.fhr?.fanduel, p?.sa?.fanduel) ?? 0
      const paSa = ratio(p?.pa1?.fanduel, p?.sa?.fanduel) ?? 0
      const raw: Record<Path, number> = {
        override: mean(mmVals.map(v => v == null ? null : pos(-v))) + 0.25 * pos(-(mm.l1 ?? 0) + (mm.l10 ?? 0)),
        shock: pos(-(hrPct ?? 0)) + 0.55 * pos(-(fhrPct ?? 0)),
        sequence: pos((hrPct ?? 0) - (fhrPct ?? 0)) + 20 * fhrSa + 10 * paSa,
        correlated: correlatedCompression(p),
        paper: mean(paperRanks.map(v => v == null ? null : 19 - v)) - 0.5 * (Math.max(...paperRanks.filter((v): v is number => v != null)) - Math.min(...paperRanks.filter((v): v is number => v != null))),
        acceleration: componentAcceleration(b),
      }
      return { name: x.p.name, team: x.team, gamePk: gb.game.gamePk, order: x.p.batting_order, bundle: b, mm, paperRank: pr, fhrPct, hrPct, picks: b?.pikkitEntry?.home_runs?.picks ?? 0, raw, pct: {} as any, selected: false, reasons: [] }
    })
    for (const path of ['override','shock','sequence','correlated','paper','acceleration'] as Path[]) {
      const vals = rows.map(r => r.raw[path])
      for (const r of rows) r.pct[path] = pctRank(r.raw[path], vals)
    }
    // Coherent pathway gates. A single arbitrary percentile cutoff failed the
    // first frozen-board run: it erased concealed and multi-signal candidates.
    // These gates use prices/features only; known outcomes remain grading-only.
    const sortedPicks = rows.map(r => r.picks).sort((a,b) => a-b)
    const lowPublic = sortedPicks[Math.floor(sortedPicks.length * .25)] ?? 0
    for (const r of rows) {
      const paths: Path[] = []
      if (r.pct.override >= .80 && !((r.hrPct ?? 0) > 10 && (r.fhrPct ?? 0) > 0)) paths.push('override')
      if (r.pct.shock >= .80 && (r.picks <= lowPublic || r.pct.paper >= .55 || r.pct.override >= .55)) paths.push('shock')
      if (r.pct.sequence >= .85 && r.pct.acceleration >= .55) paths.push('sequence')
      if (r.pct.correlated >= .90 && Math.max(r.pct.override, r.pct.shock, r.pct.paper, r.pct.acceleration) >= .65) paths.push('correlated')
      if (r.raw.paper >= 14) paths.push('paper')
      if (r.pct.acceleration >= .90 && Math.max(r.pct.paper, r.pct.shock, r.pct.sequence) >= .55) paths.push('acceleration')
      if (r.pct.paper >= .75 && r.pct.acceleration >= .65 && !paths.includes('paper')) paths.push('paper')
      r.selected = paths.length > 0
      r.reasons = paths
    }

    const selected = rows.filter(r => r.selected).sort((a,b) => Math.max(...Object.values(b.pct)) - Math.max(...Object.values(a.pct)))
    const actual = rows.filter(r => KNOWN_HR.has(normName(r.name)))
    const hits = selected.filter(r => KNOWN_HR.has(normName(r.name)))
    console.log(`\n${gb.game.awayAbbr} @ ${gb.game.homeAbbr} (${gb.game.gamePk})`)
    for (const r of selected) console.log(`  ${KNOWN_HR.has(normName(r.name)) ? 'HIT ' : 'MISS'} ${r.name.padEnd(24)} ${r.reasons.join('+').padEnd(24)} mm=${[r.mm.l10,r.mm.l5,r.mm.l3,r.mm.l1].join('/')} fhr%=${r.fhrPct?.toFixed(1)} hr%=${r.hrPct?.toFixed(1)}`)
    for (const r of actual.filter(r => !r.selected)) console.log(`  LOST ${r.name.padEnd(24)} pct=${Object.entries(r.pct).map(([k,v]) => `${k}:${v.toFixed(2)}`).join(' ')} raw=${Object.entries(r.raw).map(([k,v]) => `${k}:${v.toFixed(2)}`).join(' ')}`)
    console.log(`  recall=${hits.length}/${actual.length} precision=${hits.length}/${selected.length}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
