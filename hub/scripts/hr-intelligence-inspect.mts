import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())

const date = process.argv[2]
const gameNeedle = process.argv[3]?.toUpperCase()
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !gameNeedle) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-inspect.mts YYYY-MM-DD GAME')
}

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const { americanImplied } = await import('../src/lib/hrIntelligence')

const slate = await buildHrIntelligenceSlate(date)
const game = slate.games.find(candidate => candidate.gameKey.toUpperCase().includes(gameNeedle))
if (!game) throw new Error(`Game ${gameNeedle} was not found on ${date}.`)

const mean = (values: Array<number | null | undefined>) => {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

const rows = [...game.players]
  .sort((a, b) => a.team.localeCompare(b.team) || a.battingOrder - b.battingOrder)
  .map(player => ({
    player: player.name,
    team: player.team,
    order: player.battingOrder,
    actualFhr: game.validation?.firstHrMlbId === player.mlbId,
    actualHr: game.validation?.hrMlbIds.includes(player.mlbId) ?? false,
    fhr: player.fhr,
    fhrImplied: americanImplied(player.fhr.current),
    fhrRank: player.fhrRank,
    fhrTie: player.fhrTieSize,
    fhrBaseline: player.fhrBaselineDeltaPct,
    fhrMove: player.movement.fhrImpliedPoints,
    hr: player.hr,
    hrImplied: americanImplied(player.hr.current),
    hrRank: player.hrRank,
    hrBaseline: player.hrBaselineDeltaPct,
    hrMove: player.movement.hrImpliedPoints,
    picks: player.hrPicks,
    publicRank: player.publicRank,
    contact: player.contactAcceleration,
    mm: mean(Object.values(player.mm ?? {})),
    paper: player.paperRank,
    book: player.bookRank,
    hidden: player.movement.hiddenPowerContradiction,
    powerShort: player.movement.powerShortened,
    powerLong: player.movement.powerLengthened,
    nonPowerShort: player.movement.nonPowerShortened,
    nonPowerLong: player.movement.nonPowerLengthened,
    fhrScore: player.fhrScore,
    anytimeScore: player.anytimeScore,
  }))

process.stdout.write(`${JSON.stringify({
  date,
  game: game.gameKey,
  noHr: game.noHr,
  diagnostics: game.diagnostics,
  warnings: game.warnings,
  actual: game.validation,
  rows,
}, null, 2)}\n`)
