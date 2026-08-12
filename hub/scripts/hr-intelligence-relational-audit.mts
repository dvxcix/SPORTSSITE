import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData.ts')
const { americanImplied } = await import('../src/lib/hrIntelligence.ts')

type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]

const date = process.argv[2] ?? '2026-08-11'
const team = (process.argv[3] ?? 'MIA').toUpperCase()
const slate = await buildHrIntelligenceSlate(date)
const game = slate.games.find(item => item.awayTeam === team || item.homeTeam === team)
if (!game) throw new Error(`No ${team} game found on ${date}`)

const CASH = ['rbi1', 'tb2', 'tb3', 'tb4', 'hits1', 'runs1', 'hrr'] as const
const POWER = ['hr2', 'laser105', 'laser110', 'moonshot', 'pa1', 'hrMl'] as const
const DEAD_END = ['singles', 'doubles', 'triples', 'sb1', 'sb2'] as const
const EXTRA_EVENT = ['rbi2', 'rbi3', 'tb5', 'hits2', 'runs2'] as const

function move(player: Player, key: string) {
  const market = player.markets[key]
  const current = americanImplied(market?.current ?? null)
  const open = americanImplied(market?.open ?? null)
  return current == null || open == null ? null : (current - open) * 100
}

function mean(values: Array<number | null>) {
  const clean = values.filter((value): value is number => value != null && Number.isFinite(value))
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0
}

function positiveShare(player: Player, keys: readonly string[]) {
  const values = keys.map(key => move(player, key)).filter((value): value is number => value != null)
  return values.length ? values.filter(value => value > 0.15).length / values.length : 0
}

function percentile(values: number[], input: number, high = true) {
  const sorted = [...values].sort((a, b) => a - b)
  const below = sorted.filter(value => value < input).length
  const equal = sorted.filter(value => value === input).length
  const pct = (below + Math.max(0, equal - 1) / 2) / Math.max(1, sorted.length - 1)
  return (high ? pct : 1 - pct) * 100
}

const raw = game.players.map(player => {
  const cashMove = mean(CASH.map(key => move(player, key)))
  const powerMove = mean(POWER.map(key => move(player, key)))
  const deadEndMove = mean(DEAD_END.map(key => move(player, key)))
  const extraMove = mean(EXTRA_EVENT.map(key => move(player, key)))
  const picks = player.hrPicks ?? 0
  const fhrRank = player.fhrRank ?? 19
  const hrRank = player.hrRank ?? 19
  const publicRank = player.publicRank ?? 19
  return {
    player,
    cashMove,
    cashBreadth: positiveShare(player, CASH),
    powerMove,
    powerBreadth: positiveShare(player, POWER),
    deadEndMove,
    deadEndBreadth: positiveShare(player, DEAD_END),
    extraMove,
    picks,
    fhrRank,
    hrRank,
    publicRank,
    rankMigration: fhrRank - hrRank,
  }
})

const columns = {
  cashMove: raw.map(row => row.cashMove),
  cashBreadth: raw.map(row => row.cashBreadth),
  powerMove: raw.map(row => row.powerMove),
  deadEndMove: raw.map(row => row.deadEndMove),
  picks: raw.map(row => row.picks),
  rankMigration: raw.map(row => row.rankMigration),
  contact: raw.map(row => row.player.contactAcceleration),
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
const cashRegime = median(columns.cashMove) > 0.25
  ? 'selective-support'
  : median(columns.cashMove) < -1
    ? 'board-release'
    : 'mixed'

const rows = raw.map(row => {
  const hidden = percentile(columns.picks, row.picks, false)
  const settlement = percentile(columns.cashMove, row.cashMove) * 0.55 + percentile(columns.cashBreadth, row.cashBreadth) * 0.45
  const powerQuiet = percentile(columns.powerMove, row.powerMove, false)
  const deadEndQuiet = percentile(columns.deadEndMove, row.deadEndMove, false)
  const migration = percentile(columns.rankMigration, row.rankMigration)
  const contact = percentile(columns.contact, row.player.contactAcceleration)
  const tail = ((row.fhrRank - 1) / 17) * 100
  const baselineCamouflage = Math.max(0, 100 - Math.min(100, Math.abs(row.player.fhrBaselineDeltaPct ?? 0) * 3))
  const advertised = percentile(columns.picks, row.picks) * 0.45 + percentile(columns.powerMove, row.powerMove) * 0.35 + (100 - tail) * 0.20
  const rawContact = row.player.contactAcceleration
  // A board-release game needs defined relational jobs, not a generic high
  // score. The anchor is a quiet, unique mid-board FHR price whose batting
  // profile supports the event. The companion is a tied FHR price that becomes
  // relatively stronger in anytime HR while remaining close to baseline. This
  // is the Chase DeLauter + Jo Adell shape; a tie alone is not enough.
  const boardReleaseAnchor = cashRegime === 'board-release'
    && row.player.fhrTieSize === 1
    && row.fhrRank >= 5
    && row.fhrRank <= 14
    && hidden >= 40
    && baselineCamouflage >= 75
    && rawContact >= 12
    && contact >= 75
  const boardReleaseCompanion = cashRegime === 'board-release'
    && row.player.fhrTieSize >= 2
    && row.fhrRank >= 4
    && row.fhrRank <= 14
    && row.rankMigration >= 1
    && baselineCamouflage >= 75
    && rawContact >= 12
    && contact >= 75
  const boardReleaseRole = boardReleaseAnchor
    ? 'concealed-anchor'
    : boardReleaseCompanion
      ? 'tied-companion'
      : null
  // Relational lanes are deliberately separate. A hidden tail candidate should
  // not have to resemble a tied mid-board candidate or a legitimate favorite.
  const concealedSettlement = cashRegime === 'board-release'
    ? hidden * 0.20 + contact * 0.27 + baselineCamouflage * 0.21 + powerQuiet * 0.08 + tail * 0.08 + migration * 0.16
    : hidden * 0.24 + settlement * 0.34 + powerQuiet * 0.12 + deadEndQuiet * 0.08 + tail * 0.14 + migration * 0.08
  const tieMigration = cashRegime === 'board-release'
    ? (row.player.fhrTieSize >= 2 ? 18 : 0) + migration * 0.24 + hidden * 0.12 + contact * 0.24 + baselineCamouflage * 0.20 + powerQuiet * 0.08
    : (row.player.fhrTieSize >= 2 ? 22 : 0) + migration * 0.28 + hidden * 0.18 + settlement * 0.24 + powerQuiet * 0.08
  const releasedFavorite = (100 - tail) * 0.24 + settlement * 0.30 + percentile(columns.powerMove, row.powerMove) * 0.18 + (100 - advertised) * 0.10 + percentile(columns.picks, row.picks) * 0.18
  const laneScores = { concealedSettlement, tieMigration, releasedFavorite }
  const lane = Object.entries(laneScores).sort((a, b) => b[1] - a[1])[0]
  const exclusions: string[] = []
  // Exposure is a penalty, never a standalone veto. Jo Adell is the concrete
  // reason: moderate public interest coexisted with a flat FHR, a lengthened
  // anytime price, strong contact, and favorable tied-peer migration. Only an
  // extreme exposure sink with no relational separation is removed here.
  if (advertised >= 85 && row.publicRank <= 3 && contact < 65 && baselineCamouflage < 65) exclusions.push('extreme advertised exposure without relational separation')
  if (cashRegime !== 'board-release' && row.deadEndMove > row.cashMove + 0.8) exclusions.push('competing non-HR paths strengthened more than the HR cash bundle')
  if (cashRegime !== 'board-release' && row.cashBreadth < 0.43) exclusions.push('automatic HR cash bundle lacks breadth')
  if (cashRegime === 'board-release' && (row.player.fhrBaselineDeltaPct ?? 0) < -15 && row.publicRank <= 6) exclusions.push('baseline and public exposure identify an over-promoted sink')
  if (cashRegime === 'board-release' && contact < 65 && settlement < 90) exclusions.push('concealment is unsupported by batting form or coherent settlement pricing')
  if (cashRegime === 'board-release' && contact < 65 && row.deadEndMove > 0.5) exclusions.push('strengthened non-HR outcomes conflict with the concealed HR interpretation')
  if (cashRegime === 'board-release' && boardReleaseRole == null) exclusions.push('does not fill the game’s concealed-anchor or tied-companion role')
  if (row.powerMove > 0.5 && row.publicRank <= 3 && contact < 65) exclusions.push('power move is public-facing rather than concealed')
  if (row.player.contactAcceleration < -25 && settlement < 75) exclusions.push('form deterioration is not offset by settlement support')
  return {
    team: row.player.team,
    order: row.player.battingOrder,
    player: row.player.name,
    actual: game.validation?.firstHrMlbId === row.player.mlbId ? 'FHR' : game.validation?.hrMlbIds.includes(row.player.mlbId) ? 'HR' : '',
    lane: lane?.[0],
    role: boardReleaseRole,
    laneScore: Math.round((lane?.[1] ?? 0) * 10) / 10,
    excluded: exclusions.length > 0,
    exclusions,
    structure: {
      fhr: row.player.fhr.current,
      hr: row.player.hr.current,
      fhrRank: row.fhrRank,
      hrRank: row.hrRank,
      tie: row.player.fhrTieSize,
      picks: row.picks,
      publicRank: row.publicRank,
      cashMove: Math.round(row.cashMove * 100) / 100,
      cashBreadth: Math.round(row.cashBreadth * 100),
      powerMove: Math.round(row.powerMove * 100) / 100,
      deadEndMove: Math.round(row.deadEndMove * 100) / 100,
      settlement: Math.round(settlement),
      hidden: Math.round(hidden),
      advertised: Math.round(advertised),
      contact: row.player.contactAcceleration,
      baselineCamouflage: Math.round(baselineCamouflage),
    },
  }
}).sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.laneScore - a.laneScore)

process.stdout.write(`${JSON.stringify({
  date,
  game: game.gameKey,
  noHr: game.noHr,
  cashRegime,
  actual: game.validation ? { first: game.validation.firstHrName, homers: game.validation.hrNames } : null,
  candidates: rows.filter(row => !row.excluded).slice(0, 6),
  eliminated: rows.filter(row => row.excluded),
}, null, 2)}\n`)
