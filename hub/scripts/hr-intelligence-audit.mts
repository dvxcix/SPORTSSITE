import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
await import('./lib/install-pikkit-fixture-fetch.mts')

const date = process.argv[2]
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new Error('Usage: npx tsx scripts/hr-intelligence-audit.mts YYYY-MM-DD')
}
const gameFilter = process.argv.find(value => value.startsWith('--game='))?.slice('--game='.length).toUpperCase() ?? null

const { buildHrIntelligenceSlate } = await import('../src/lib/hrIntelligenceData')
const slate = await buildHrIntelligenceSlate(date)

const output = {
  date: slate.date,
  diagnostics: slate.diagnostics,
  summary: {
    games: slate.games.length,
    graded: slate.games.filter(game => game.validation).length,
    primaryAttempts: slate.games.filter(game => game.validation?.primaryPublished).length,
    primaryHits: slate.games.filter(game => game.validation?.primaryPublished && game.validation.anchorHit).length,
    diagnosticLeaderHits: slate.games.filter(game => game.validation?.diagnosticLeaderHit).length,
    contradictionLeaderHits: slate.games.filter(game => game.validation?.contradictionLeaderHit).length,
    modelLeaderHits: slate.games.filter(game => game.validation?.modelLeaderHit).length,
    marketLeaderHits: slate.games.filter(game => game.validation?.marketLeaderHit).length,
    companionAttempts: slate.games.filter(game => game.validation?.companionPublished).length,
    companionHits: slate.games.filter(game => game.validation?.companionPublished && game.validation.companionHit).length,
    pairAttempts: slate.games.filter(game => game.validation?.primaryPublished && game.validation.companionPublished).length,
    pairHits: slate.games.filter(game => game.validation?.primaryPublished && game.validation.companionPublished && game.validation.pairHit).length,
    fhrShortlistAttempts: slate.games.filter(game => game.validation?.fhrShortlistPublished).length,
    fhrShortlistHits: slate.games.filter(game => game.validation?.fhrShortlistPublished && game.validation.fhrShortlistHit).length,
    diagnosticFhrCandidateHits: slate.games.filter(game => game.validation?.diagnosticFhrShortlistHit).length,
    diagnosticContrarianHits: slate.games.filter(game => game.validation?.contrarianWatchHit).length,
    diagnosticCandidateOrContrarianHits: slate.games.filter(game => game.validation && (game.validation.diagnosticFhrShortlistHit || game.validation.contrarianWatchHit)).length,
    diagnosticPairCoverageHits: slate.games.filter(game => game.validation?.pairCoverageHit).length,
    diagnosticCompanionWatchHits: slate.games.filter(game => game.validation?.companionShortlistHit).length,
    companionWatchAttempts: slate.games.filter(game => game.validation?.companionWatchPublished).length,
    companionWatchHits: slate.games.filter(game => game.validation?.companionWatchPublished && game.validation.companionShortlistHit).length,
    noHrGames: slate.games.filter(game => game.validation?.actualNoHr).length,
  },
  games: slate.games.map(game => {
    const byId = new Map(game.players.map(player => [player.mlbId, player]))
    const anchor = game.recommendation.fhrAnchorMlbId == null ? null : byId.get(game.recommendation.fhrAnchorMlbId)
    const diagnosticLeader = game.recommendation.diagnosticLeaderMlbId == null ? null : byId.get(game.recommendation.diagnosticLeaderMlbId)
    const contradictionLeader = game.recommendation.contradictionLeaderMlbId == null ? null : byId.get(game.recommendation.contradictionLeaderMlbId)
    const modelLeader = game.recommendation.modelLeaderMlbId == null ? null : byId.get(game.recommendation.modelLeaderMlbId)
    const marketLeader = game.recommendation.marketLeaderMlbId == null ? null : byId.get(game.recommendation.marketLeaderMlbId)
    const companion = game.recommendation.anytimeCompanionMlbId == null ? null : byId.get(game.recommendation.anytimeCompanionMlbId)
    const fhrShortlist = game.recommendation.fhrShortlistMlbIds.map(id => byId.get(id)?.name).filter(Boolean)
    const fhrCandidates = game.recommendation.fhrCandidateMlbIds.map(id => byId.get(id)).filter(Boolean)
    const anytimeCandidates = game.recommendation.anytimeCandidateMlbIds.map(id => byId.get(id)).filter(Boolean)
    const contrarianWatchlist = game.recommendation.contrarianWatchMlbIds.map(id => byId.get(id)?.name).filter(Boolean)
    const companionWatchlist = game.recommendation.companionShortlistMlbIds.map(id => byId.get(id)?.name).filter(Boolean)
    return {
      gamePk: game.gamePk,
      gameKey: game.gameKey,
      matchup: `${game.awayTeam} @ ${game.homeTeam}`,
      status: game.recommendation.status,
      confidence: game.recommendation.confidence,
      noHrImpliedPct: game.diagnostics.noHrImpliedPct,
      recommendation: {
        primaryLane: game.recommendation.primaryLane,
        anchor: anchor?.name ?? null,
        diagnosticLeader: diagnosticLeader?.name ?? null,
        anchorScore: anchor?.fhrScore ?? null,
        contradictionLeader: contradictionLeader?.name ?? null,
        modelLeader: modelLeader?.name ?? null,
        marketLeader: marketLeader?.name ?? null,
        companion: companion?.name ?? null,
        companionScore: companion?.anytimeScore ?? null,
        fhrCandidates: fhrCandidates.map(player => ({ name: player?.name, lanes: player?.qualifiedLanes })),
        anytimeCandidates: anytimeCandidates.map(player => ({ name: player?.name, lanes: player?.qualifiedLanes })),
        fhrShortlist,
        contrarianWatchlist,
        companionWatchlist,
      },
      actual: game.validation ? {
        noHr: game.validation.actualNoHr,
        firstHr: game.validation.firstHrName,
        homeRuns: game.validation.hrNames,
        anchorHit: game.validation.anchorHit,
        contradictionLeaderHit: game.validation.contradictionLeaderHit,
        modelLeaderHit: game.validation.modelLeaderHit,
        marketLeaderHit: game.validation.marketLeaderHit,
        companionHit: game.validation.companionHit,
        pairHit: game.validation.pairHit,
        fhrShortlistHit: game.validation.fhrShortlistHit,
        diagnosticFhrShortlistHit: game.validation.diagnosticFhrShortlistHit,
        anytimeCandidateHits: game.validation.anytimeCandidateHits,
        anytimeCandidateMisses: game.validation.anytimeCandidateMisses,
        contrarianWatchHit: game.validation.contrarianWatchHit,
        companionShortlistHit: game.validation.companionShortlistHit,
        candidateSetPairHit: game.validation.candidateSetPairHit,
        candidateContrarianPairHit: game.validation.candidateContrarianPairHit,
        pairCoverageHit: game.validation.pairCoverageHit,
      } : null,
      fhrTop5: [...game.players].sort((a, b) => b.fhrScore - a.fhrScore).slice(0, 5).map(player => ({
        name: player.name,
        team: player.team,
        score: player.fhrScore,
        price: player.fhr.current,
        rank: player.fhrRank,
        picks: player.hrPicks,
        baselineDelta: player.fhrBaselineDeltaPct,
        move: player.movement.fhrImpliedPoints,
        mm: player.mm,
      })),
      anytimeTop5: [...game.players].sort((a, b) => b.anytimeScore - a.anytimeScore).slice(0, 5).map(player => ({
        name: player.name,
        team: player.team,
        score: player.anytimeScore,
        price: player.hr.current,
        rank: player.hrRank,
        picks: player.hrPicks,
        baselineDelta: player.hrBaselineDeltaPct,
        move: player.movement.hrImpliedPoints,
        contactAcceleration: player.contactAcceleration,
        hiddenPowerContradiction: player.movement.hiddenPowerContradiction,
      })),
      relationalTop8: [...game.players].sort((a, b) => b.selectionScore - a.selectionScore).slice(0, process.argv.includes('--all-players') ? 18 : 8).map(player => ({
        name: player.name,
        team: player.team,
        order: player.battingOrder,
        selection: player.selectionScore,
        decoyRisk: player.decoyRiskScore,
        archetype: player.candidateArchetype,
        fhr: player.fhr.current,
        fhrOpen: player.fhr.open,
        hr: player.hr.current,
        hrOpen: player.hr.open,
        hrPicks: player.hrPicks,
        publicRank: player.publicRank,
        publicSharePct: player.publicSharePct,
        fhrBaselineDelta: player.fhrBaselineDeltaPct,
        hrBaselineDelta: player.hrBaselineDeltaPct,
        fhrMove: player.movement.fhrImpliedPoints,
        hrMove: player.movement.hrImpliedPoints,
        fhrTieSize: player.fhrTieSize,
        hrTieSize: player.hrTieSize,
        mm: player.mm,
        paperRank: player.paperRank,
        bookRank: player.bookRank,
        contactAcceleration: player.contactAcceleration,
        publicPattern: player.publicPattern,
        picksByMarket: player.picksByMarket,
        markets: player.markets,
        marketBooks: player.marketBooks,
        cashStackSupport: player.cashStackSupportScore,
        alternativePath: player.alternativePathScore,
        crossBookSupport: player.crossBookSupportScore,
        archetypeScores: player.archetypeScores,
      })),
    }
  }),
}

if (process.argv.includes('--compact')) {
  const compact = output.games.filter(game => !gameFilter || game.gameKey === gameFilter).map(game => {
    const source = slate.games.find(candidate => candidate.gamePk === game.gamePk)!
    const contradictionOrder = [...source.players].sort((a, b) => b.contradictionScore - a.contradictionScore)
    const modelOrder = [...source.players].sort((a, b) => b.modelFhrScore - a.modelFhrScore)
    const marketOrder = [...source.players].sort((a, b) => (a.fhrRank ?? 99) - (b.fhrRank ?? 99))
    const anytimeOrder = [...source.players].sort((a, b) => b.anytimeScore - a.anytimeScore)
    const firstHr = source.validation?.firstHrMlbId ?? null
    const companionIds = new Set((source.validation?.hrMlbIds ?? []).filter(id => id !== firstHr))
    return {
      game: game.gameKey,
      status: game.status,
      confidence: game.confidence,
      noHr: game.noHrImpliedPct,
      pickCoverage: source.diagnostics.picksCoveragePct,
      diagnostic: `${game.recommendation.diagnosticLeader ?? 'None'} / ${game.recommendation.companion ?? 'None'}`,
      fhrShortlist: game.recommendation.fhrShortlist,
      contrarianWatchlist: game.recommendation.contrarianWatchlist,
      companionWatchlist: game.recommendation.companionWatchlist,
      actual: game.actual?.noHr ? 'NO HR' : `${game.actual?.firstHr ?? 'ungraded'} / ${(game.actual?.homeRuns ?? []).filter(name => name !== game.actual?.firstHr).join(', ') || 'none'}`,
      actualContradictionRank: firstHr == null ? null : contradictionOrder.findIndex(player => player.mlbId === firstHr) + 1,
      actualModelRank: firstHr == null ? null : modelOrder.findIndex(player => player.mlbId === firstHr) + 1,
      actualMarketRank: firstHr == null ? null : marketOrder.findIndex(player => player.mlbId === firstHr) + 1,
      bestActualCompanionModelRank: companionIds.size
        ? Math.min(...anytimeOrder.map((player, index) => companionIds.has(player.mlbId) ? index + 1 : Number.POSITIVE_INFINITY))
        : null,
      fhrShortlistHit: game.actual?.fhrShortlistHit ?? false,
      contrarianWatchHit: game.actual?.contrarianWatchHit ?? false,
      companionWatchHit: game.actual?.companionShortlistHit ?? false,
      pairCoverageHit: game.actual?.pairCoverageHit ?? false,
      relationalTop8: game.relationalTop8,
    }
  })
  process.stdout.write(`${JSON.stringify({ date: output.date, diagnostics: output.diagnostics, summary: output.summary, games: compact }, null, 2)}\n`)
} else {
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}
