import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const start = process.argv[2]
const end = process.argv[3] ?? start
if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-shortlist-audit.mts YYYY-MM-DD [YYYY-MM-DD]')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')
type Slate = Awaited<ReturnType<typeof buildHrIntelligenceSlate>>
type Game = Slate['games'][number]
type Player = Game['players'][number]

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
const mean = (values: Array<number | null | undefined>) => {
  const usable = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null
}
const priceRank = (rank: number | null, count: number) => rank == null || count < 2 ? 0 : 1 - (rank - 1) / (count - 1)
const positive = (value: number | null | undefined, scale: number) => clamp((value ?? 0) / scale)
const negative = (value: number | null | undefined, scale: number) => clamp(-(value ?? 0) / scale)
const stable = (value: number | null | undefined, scale: number) => value == null ? 0 : clamp(1 - Math.abs(value) / scale)
const subtle = (value: number | null | undefined, scale: number) => value == null ? 0 : clamp(1 - Math.abs(value) / scale)

function formScore(player: Player, game: Game) {
  const mm = mean(Object.values(player.mm ?? {}))
  const paper = mean(Object.values(player.paperRank ?? {}))
  return (
    priceRank(player.fhrRank, game.players.length) * 0.30 +
    clamp((player.contactAcceleration + 45) / 90) * 0.28 +
    positive(mm, 8) * 0.16 +
    (paper == null ? 0 : clamp((game.players.length + 1 - paper) / game.players.length)) * 0.14 +
    clamp((10 - player.battingOrder) / 9) * 0.12
  )
}

function contradictionScore(player: Player) {
  const hrLonger = negative(player.movement.hrImpliedPoints, 2.5)
  const fhrQuiet = stable(player.movement.fhrImpliedPoints, 1.1)
  const baselineQuiet = subtle(player.fhrBaselineDeltaPct, 15)
  const underAdvertised = clamp(1 - player.advertisedScore / 100)
  const paper = mean(Object.values(player.paperRank ?? {}))
  const book = mean(Object.values(player.bookRank ?? {}))
  const paperBookGap = paper == null || book == null ? 0 : clamp((book - paper) / 10)
  const notTopMarket = player.fhrRank == null ? 0 : player.fhrRank >= 4 && player.fhrRank <= 12 ? 1 : 0.15
  return (
    fhrQuiet * 0.20 +
    hrLonger * 0.19 +
    baselineQuiet * 0.16 +
    underAdvertised * 0.12 +
    paperBookGap * 0.11 +
    notTopMarket * 0.09 +
    clamp(player.movement.hiddenPowerContradiction / 100) * 0.08 +
    clamp((player.fhrTieSize - 1) / 3) * 0.05
  )
}

function distinctTop(groups: Player[][], limit: number) {
  const selected: Player[] = []
  for (const group of groups) {
    const player = group.find(candidate => !selected.some(existing => existing.mlbId === candidate.mlbId))
    if (player) selected.push(player)
    if (selected.length >= limit) break
  }
  return selected
}

const dates: string[] = []
for (let cursor = new Date(`${start}T12:00:00Z`); cursor <= new Date(`${end}T12:00:00Z`); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
  dates.push(cursor.toISOString().slice(0, 10))
}

let games = 0
let hrGames = 0
let hits = 0
let marketHits = 0
let oldHits = 0
const variantHits: Record<string, number> = {
  contradiction2Form1: 0,
  contradiction1Form1Market1: 0,
  contradiction2Market1: 0,
  contradiction1Form1Old1: 0,
}
const details: Array<Record<string, unknown>> = []
for (const date of dates) {
  const slate = await buildHrIntelligenceSlate(date)
  for (const game of slate.games) {
    if (!game.validation) continue
    games += 1
    if (game.validation.actualNoHr || game.validation.firstHrMlbId == null) continue
    hrGames += 1
    const market = [...game.players].sort((a, b) => (americanImplied(b.fhr.current) ?? -1) - (americanImplied(a.fhr.current) ?? -1))
    const contradiction = [...game.players].sort((a, b) => contradictionScore(b) - contradictionScore(a))
    const form = [...game.players].sort((a, b) => formScore(b, game) - formScore(a, game))
    const old = [...game.players].sort((a, b) => b.fhrScore - a.fhrScore)
    const shortlist = distinctTop([contradiction, contradiction.slice(1), form, market, old], 3)
    const variants = {
      contradiction2Form1: distinctTop([contradiction, contradiction.slice(1), form], 3),
      contradiction1Form1Market1: distinctTop([contradiction, form, market], 3),
      contradiction2Market1: distinctTop([contradiction, contradiction.slice(1), market], 3),
      contradiction1Form1Old1: distinctTop([contradiction, form, old], 3),
    }
    const firstId = game.validation.firstHrMlbId
    if (shortlist.some(player => player.mlbId === firstId)) hits += 1
    if (market.slice(0, 3).some(player => player.mlbId === firstId)) marketHits += 1
    if (old.slice(0, 3).some(player => player.mlbId === firstId)) oldHits += 1
    for (const [name, candidates] of Object.entries(variants)) {
      if (candidates.some(player => player.mlbId === firstId)) variantHits[name] += 1
    }
    if (date === '2026-08-11') details.push({
      game: game.gameKey,
      actual: game.validation.firstHrName,
      shortlist: shortlist.map(player => player.name),
      contradiction: contradiction.slice(0, 3).map(player => player.name),
      form: form.slice(0, 3).map(player => player.name),
      market: market.slice(0, 3).map(player => player.name),
    })
  }
}

const pct = (value: number) => Math.round(value / Math.max(1, hrGames) * 1000) / 10
process.stdout.write(`${JSON.stringify({
  games,
  hrGames,
  shortlist: { hits, rate: pct(hits) },
  variants: Object.fromEntries(Object.entries(variantHits).map(([name, value]) => [name, { hits: value, rate: pct(value) }])),
  marketTop3: { hits: marketHits, rate: pct(marketHits) },
  oldTop3: { hits: oldHits, rate: pct(oldHits) },
  details,
}, null, 2)}\n`)
