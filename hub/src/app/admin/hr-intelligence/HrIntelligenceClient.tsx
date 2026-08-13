'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Activity, AlertTriangle, BarChart3, ChevronDown, Crosshair, EyeOff, RefreshCw, ShieldCheck, Sparkles, Target, Users } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import type { HrIntelGameResult, HrIntelPlayerResult } from '@/lib/hrIntelligence'
import { HR_INTELLIGENCE_CALIBRATION } from '@/lib/hrIntelligenceCalibration'
import type { HrIntelligenceSlate } from '@/lib/hrIntelligenceData'
import styles from './HrIntelligence.module.css'

const AUDITED_COMPLETE_GAMES = Object.values(HR_INTELLIGENCE_CALIBRATION.splits)
  .reduce((total, split) => total + split.completeGames, 0)
const QUALIFIED_FHR_RULES = HR_INTELLIGENCE_CALIBRATION.qualifiedRules.filter(rule => rule.target === 'fhr').length
const QUALIFIED_ANYTIME_RULES = HR_INTELLIGENCE_CALIBRATION.qualifiedRules.filter(rule => rule.target === 'anytime').length

const MARKET_LABELS: Record<string, string> = {
  hr2: '2+ HR', laser105: '105+ HR', laser110: '110+ HR', moonshot: 'Moonshot', pa1: '1st PA HR', hrMl: 'HR / ML',
  hrr: 'H+R+RBI',
  rbi1: '1+ RBI', rbi2: '2+ RBI', rbi3: '3+ RBI', tb2: '2+ TB', tb3: '3+ TB', tb4: '4+ TB', tb5: '5+ TB',
  singles: 'Single', doubles: 'Double', triples: 'Triple', hits1: '1+ Hit', hits2: '2+ Hits', runs1: '1+ Run', runs2: '2+ Runs',
  sb1: '1+ SB', sb2: '2+ SB',
}

const PICK_LABELS: Record<string, string> = {
  home_runs: 'HR', hits: 'Hits', runs: 'Runs', stolen_bases: 'SB', singles: 'Singles', doubles: 'Doubles', triples: 'Triples',
  rbi: 'RBI', hits_runs_rbi: 'H+R+RBI', bases: 'Bases',
}

function easternToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function odds(value: number | null) {
  if (value == null) return 'N/A'
  return value > 0 ? `+${value}` : String(value)
}

function signed(value: number | null, suffix = '') {
  if (value == null) return 'N/A'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function TeamLogo({ team }: { team: string }) {
  const logo = getTeamLogoUrl(team)
  return logo ? <Image src={logo} alt={`${team} logo`} width={28} height={28} unoptimized /> : <span>{team}</span>
}

function PlayerIdentity({ player, role }: { player: HrIntelPlayerResult; role?: string }) {
  return <div className={styles.playerIdentity}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={42} />
    <div><strong>{player.name}</strong><span>{role ? `${role} | ` : ''}{player.team} | #{player.battingOrder} | {player.position}</span></div>
  </div>
}

function SignalCard({ player, role, score, kind }: { player: HrIntelPlayerResult | null; role: string; score: number | null; kind: 'diagnostic' | 'contradiction' | 'model' | 'market' | 'exposure' }) {
  const Icon = kind === 'diagnostic' ? Target : kind === 'contradiction' ? Crosshair : kind === 'model' ? Sparkles : kind === 'exposure' ? Users : BarChart3
  return <article className={styles.recommendationCard} data-kind={kind}>
    <header><span><Icon size={15} /> {role}</span><b>{score == null ? 'N/A' : score.toFixed(1)}</b></header>
    {player ? <>
      <PlayerIdentity player={player} />
      <div className={styles.quickEvidence}>
        <span>FHR {odds(player.fhr.current)}</span><span>HR {odds(player.hr.current)}</span><span>{player.hrPicks ?? 'N/A'} HR picks</span>
      </div>
    </> : <p className={styles.missing}>No qualified player</p>}
  </article>
}

function WatchRow({ player, rank, lane }: { player: HrIntelPlayerResult; rank: number; lane: 'candidate' | 'contrarian' | 'companion' | 'calibrated' }) {
  const score = lane === 'calibrated' ? player.calibratedAnytimeScore : player.selectionScore
  const label = lane === 'candidate' ? player.candidateArchetype : lane === 'contrarian' ? 'next relational read' : lane === 'calibrated' ? 'chronological anytime model' : 'independent companion'
  return <div className={styles.pairRow}>
    <b className={styles.pairRank}>{rank}</b>
    <div className={styles.pairPlayers}>
      <span><PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={31} /><span><b>{player.name}</b><small>{player.team} | #{player.battingOrder} | {odds(player.fhr.current)} FHR</small></span></span>
    </div>
    <div className={styles.pairScore}><strong>{score.toFixed(1)}</strong><small>{label}</small></div>
  </div>
}

function PlayerDetail({ player }: { player: HrIntelPlayerResult }) {
  return <div className={styles.playerDetail}>
    <div className={styles.evidenceGrid}>{player.evidence.map(item => <div key={item.key} data-tone={item.tone}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    <section><h4>Market ladder</h4><div className={styles.marketGrid}>{Object.entries(player.markets).map(([key, value]) => <div key={key}><span>{MARKET_LABELS[key] ?? key}</span><strong>{odds(value.open)} <i>to</i> {odds(value.current)}</strong></div>)}</div></section>
    <section><h4>Public exposure by market</h4><div className={styles.marketGrid}>{Object.entries(player.picksByMarket).map(([key, value]) => <div key={key}><span>{PICK_LABELS[key] ?? key}</span><strong>{value ?? 'N/A'}</strong></div>)}</div></section>
    <section><h4>MM and rank windows</h4><div className={styles.windowGrid}>{(['l1', 'l3', 'l5', 'l10'] as const).map(window => <div key={window}><span>{window.toUpperCase()}</span><strong>MM {player.mm?.[window] ?? 'N/A'}</strong><small>Book {player.bookRank?.[window] ?? 'N/A'} | Paper {player.paperRank?.[window] ?? 'N/A'}</small></div>)}</div></section>
  </div>
}

function PlayerBoardRow({ player, expanded, onToggle }: { player: HrIntelPlayerResult; expanded: boolean; onToggle: () => void }) {
  return <div className={styles.playerRowWrap}>
    <button type="button" className={styles.playerRow} onClick={onToggle} aria-expanded={expanded}>
      <span className={styles.order}>{player.battingOrder}</span>
      <PlayerIdentity player={player} />
      <span><small>FHR</small><strong>{odds(player.fhr.current)}</strong><i>{player.fhrTieSize > 1 ? `${player.fhrTieSize}-way tie` : signed(player.fhrBaselineDeltaPct, '%')}</i></span>
      <span><small>Anytime</small><strong>{odds(player.hr.current)}</strong><i>{signed(player.movement.hrImpliedPoints, ' pp')}</i></span>
      <span><small>Public</small><strong>{player.hrPicks ?? 'N/A'}</strong><i>#{player.publicRank ?? 'N/A'}</i></span>
      <span><small>Contact</small><strong>{signed(player.contactAcceleration, '%')}</strong><i>MM {player.mm?.l10 ?? 'N/A'}</i></span>
      <span><small>Game graph</small><strong>{player.graphFhrScore.toFixed(1)} / {player.graphAnytimeScore.toFixed(1)}</strong><i>FHR node / anytime node</i></span>
      <ChevronDown size={16} className={expanded ? styles.rotated : ''} />
    </button>
    {expanded ? <PlayerDetail player={player} /> : null}
  </div>
}

function GameAnalysis({ game }: { game: HrIntelGameResult }) {
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null)
  const playersById = useMemo(() => new Map(game.players.map(player => [player.mlbId, player])), [game.players])
  const getPlayer = (id: number | null) => id == null ? null : playersById.get(id) ?? null
  const diagnosticLeader = getPlayer(game.recommendation.diagnosticLeaderMlbId)
  const contradictionLeader = getPlayer(game.recommendation.contradictionLeaderMlbId)
  const modelLeader = getPlayer(game.recommendation.modelLeaderMlbId)
  const marketLeader = getPlayer(game.recommendation.marketLeaderMlbId)
  const exposureLeader = getPlayer(game.recommendation.exposureLeaderMlbId)
  const publishedCandidates = game.recommendation.fhrCandidateMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const diagnosticCandidates = game.recommendation.fhrShortlistMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const contrarianWatch = game.recommendation.contrarianWatchMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const companionWatch = game.recommendation.companionShortlistMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const calibratedWatch = game.recommendation.calibratedAnytimeShortlistMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const graphFhrWatch = game.recommendation.graphFhrShortlistMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const graphAnytimeWatch = game.recommendation.graphAnytimeShortlistMlbIds.map(id => playersById.get(id)).filter((player): player is HrIntelPlayerResult => !!player)
  const decisionAnchor = diagnosticCandidates[0] ?? null
  const decisionCompanion = companionWatch.find(player => player.mlbId !== decisionAnchor?.mlbId) ?? null
  const away = game.players.filter(player => player.team === game.awayTeam).sort((a, b) => a.battingOrder - b.battingOrder)
  const home = game.players.filter(player => player.team === game.homeTeam).sort((a, b) => a.battingOrder - b.battingOrder)

  return <div className={styles.analysis}>
    <section className={styles.signalHeader} data-status={game.recommendation.status}>
      <div><span><ShieldCheck size={14} /> {game.recommendation.publicationEligible ? 'VALIDATED READ' : 'NO VALIDATED READ'}</span><h2>{game.recommendation.confidenceLabel} diagnostic separation</h2><p>{game.recommendation.reason}</p><small>{game.recommendation.publicationReason}</small></div>
      <div className={styles.confidence}><strong>{game.recommendation.confidence.toFixed(1)}</strong><span>Diagnostic strength</span></div>
    </section>

    {game.warnings.length ? <div className={styles.warnings}>{game.warnings.map(warning => <p key={warning}><AlertTriangle size={14} /> {warning}</p>)}</div> : null}

    {game.validation ? <section className={styles.validation} data-hit={game.validation.fhrShortlistHit}>
      <div><span>POSTGAME VALIDATION</span><strong>{game.validation.actualNoHr ? 'No home runs' : `First HR: ${game.validation.firstHrName ?? 'Unknown'}`}</strong><small>Outcomes appear only after scoring and never enter the pregame read.</small></div>
      <div>
        <b>{game.validation.diagnosticLeaderHit ? 'Diagnostic leader hit' : 'Diagnostic leader missed'}</b>
        <b>{game.validation.fhrShortlistPublished ? game.validation.fhrShortlistHit ? 'Published FHR set hit' : 'Published FHR set missed' : 'FHR publication withheld'}</b>
        <b>{game.validation.diagnosticFhrShortlistHit ? 'Diagnostic FHR hypothesis hit' : 'Diagnostic FHR hypothesis missed'}</b>
        <b>{game.validation.contrarianWatchHit ? 'Contrarian watch hit' : 'Contrarian watch missed'}</b>
        <b>{game.validation.pairCoverageHit ? 'Diagnostic pair coverage hit' : 'No diagnostic pair coverage hit'}</b>
        <b>{!game.validation.companionWatchPublished ? 'Companion publication withheld' : game.validation.companionShortlistHit ? 'Companion watch hit' : 'Companion watch missed'}</b>
      </div>
      {!game.validation.actualNoHr ? <p>All HRs: {game.validation.hrNames.join(', ')}</p> : null}
    </section> : null}

    <section className={styles.decision}>
      <header>
        <div><span>PREGAME REDUCTION</span><h3>{decisionAnchor && decisionCompanion ? `${decisionAnchor.name} + ${decisionCompanion.name}` : decisionAnchor?.name ?? 'No coherent pair'}</h3></div>
        <small>One board-level answer. The first player is the FHR anchor and the second is the anytime companion.</small>
      </header>
      <div className={styles.decisionPlayers}>
        <SignalCard player={decisionAnchor} role="FHR anchor" score={decisionAnchor?.selectionScore ?? null} kind="diagnostic" />
        <SignalCard player={decisionCompanion} role="Anytime companion" score={decisionCompanion?.selectionScore ?? null} kind="contradiction" />
      </div>
      <p>{game.recommendation.fhrRecipe}. {game.recommendation.companionRecipe}.</p>
    </section>

    <details className={styles.auditDetails}>
      <summary>Open supporting diagnostics</summary>
    <section className={styles.recommendations}>
      <SignalCard player={diagnosticLeader} role={diagnosticLeader ? `${diagnosticLeader.candidateArchetype} diagnostic` : 'Relational diagnostic'} score={diagnosticLeader?.selectionScore ?? null} kind="diagnostic" />
      <SignalCard player={contradictionLeader} role="Contradiction leader" score={contradictionLeader?.contradictionScore ?? null} kind="contradiction" />
      <SignalCard player={modelLeader} role="Model leader" score={modelLeader?.modelFhrScore ?? null} kind="model" />
      <SignalCard player={exposureLeader} role="Exposure contradiction" score={exposureLeader?.publicPattern.redirectedExposureScore ?? null} kind="exposure" />
      <SignalCard player={marketLeader} role="Market benchmark" score={marketLeader == null ? null : 19 - (marketLeader.fhrRank ?? 18)} kind="market" />
    </section>

    <section className={styles.diagnostics}>
      <div><Target size={17} /><span><strong>{game.diagnostics.boardProfile}</strong> board profile</span></div>
      <div><Activity size={17} /><span><strong>{game.diagnostics.marketCoveragePct}%</strong> market coverage</span></div>
      <div><Users size={17} /><span><strong>{game.diagnostics.picksCoveragePct}%</strong> HR pick coverage</span></div>
      <div><Users size={17} /><span><strong>{game.diagnostics.crossMarketPicksCoveragePct}%</strong> cross-market coverage</span></div>
      <div><EyeOff size={17} /><span><strong>{game.diagnostics.noHrImpliedPct == null ? 'N/A' : `${game.diagnostics.noHrImpliedPct}%`}</strong> No HR implied</span></div>
    </section>

    <div className={styles.candidateGrid}>
      <section className={styles.panel}>
        <header><div><span>GAME GRAPH</span><h3>Board-relative FHR anchors</h3></div><small>Ranks all 18 players by price, baseline, exposure, derivative and rank dislocation within this game. Candidate labels do not gate this list.</small></header>
        <div className={styles.pairList}>{graphFhrWatch.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="candidate" />)}</div>
      </section>
      <section className={styles.panel}>
        <header><div><span>GAME GRAPH</span><h3>Anytime companion cluster</h3></div><small>Finds the strongest connected players across FHR clusters, ratios, movements, derivative prices and public exposure.</small></header>
        <div className={styles.pairList}>{graphAnytimeWatch.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="companion" />)}</div>
      </section>
      <section className={styles.panel}>
        <header><div><span>CHRONOLOGICAL MODEL</span><h3>Anytime HR board shortlist</h3></div><small>Frozen through August 8 and measured on later slates. This ranks the complete board and remains separate from the publication gate.</small></header>
        <div className={styles.pairList}>{calibratedWatch.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="calibrated" />)}</div>
      </section>
      <section className={styles.panel}>
        <header><div><span>PUBLICATION GATE</span><h3>{game.recommendation.publicationEligible ? 'Validated candidate set' : 'No wager set published'}</h3></div><small>A player appears here only after its rule survives chronological discovery, calibration, and untouched holdout.</small></header>
        <div className={styles.pairList}>{publishedCandidates.length ? publishedCandidates.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="candidate" />) : <p className={styles.missing}>{game.recommendation.publicationReason}</p>}</div>
      </section>
      <section className={styles.panel}>
        <header><div><span>DIAGNOSTIC HYPOTHESES</span><h3>{game.recommendation.fhrRecipe}</h3></div><small>These explain the board and support research. They are not picks and did not clear publication.</small></header>
        <div className={styles.pairList}>{diagnosticCandidates.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="candidate" />)}</div>
      </section>
    </div>

    {contrarianWatch.length ? <section className={styles.panel}>
      <header><div><span>NEXT DIAGNOSTIC READS</span><h3>Signals outside the primary hypothesis</h3></div><small>Visible for comparison only. These players did not clear the publication gate.</small></header>
      <div className={styles.pairList}>{contrarianWatch.map((player, index) => <WatchRow key={player.mlbId} player={player} rank={index + 1} lane="contrarian" />)}</div>
    </section> : null}

    </details>

    <div className={styles.contentGrid}>
      <section className={styles.panel}>
        <header><div><span>FULL BOARD</span><h3>All 18 players</h3></div><small>Expand any player for every captured market, pick category, and MM window.</small></header>
        {[{ team: game.awayTeam, players: away }, { team: game.homeTeam, players: home }].map(group => <div className={styles.teamGroup} key={group.team}>
          <h4><TeamLogo team={group.team} /> {group.team}<span>{group.players.length}/9</span></h4>
          {group.players.map(player => <PlayerBoardRow key={player.mlbId} player={player} expanded={expandedPlayer === player.mlbId} onToggle={() => setExpandedPlayer(current => current === player.mlbId ? null : player.mlbId)} />)}
        </div>)}
      </section>
    </div>
  </div>
}

export function HrIntelligenceClient() {
  const [date, setDate] = useState(easternToday)
  const [result, setResult] = useState<HrIntelligenceSlate | null>(null)
  const [selectedGamePk, setSelectedGamePk] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const selectedGame = useMemo(() => result?.games.find(game => game.gamePk === selectedGamePk) ?? result?.games[0] ?? null, [result, selectedGamePk])

  async function analyze() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/hr-intelligence?date=${encodeURIComponent(date)}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to analyze the slate.')
      const next = payload as HrIntelligenceSlate
      setResult(next)
      setSelectedGamePk(next.games[0]?.gamePk ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to analyze the slate.')
    } finally {
      setLoading(false)
    }
  }

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div className={styles.heroIcon}><Crosshair size={25} /></div>
      <div><span>ADMIN | PREGAME DECISION TERMINAL</span><h1>HR Intelligence</h1><p>Reconstruct each 18-player board and compare price clusters, market ladders, exposure, form, and No HR pressure without forcing a pick.</p></div>
      <div className={styles.heroMeta}><b>Outcome blind</b><span>Postgame results never enter scoring.</span></div>
    </section>

    <section className={styles.controls}>
      <label><span>Slate date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" onClick={analyze} disabled={loading || !date}>{loading ? <RefreshCw size={17} className={styles.spin} /> : <BarChart3 size={17} />}{loading ? 'Reconstructing board...' : 'Analyze full slate'}</button>
      {result ? <div><strong>{result.diagnostics.gamesAnalyzed}</strong><span>games analyzed</span></div> : null}
    </section>

    <section className={styles.calibrationLedger} aria-label="HR intelligence publication audit">
      <div className={styles.calibrationIntro}>
        <span>PUBLICATION AUDIT</span>
        <strong>Fail-closed calibration</strong>
        <small>Diagnostic rankings remain visible. Picks stay withheld until a rule survives chronological discovery, calibration, and untouched holdout.</small>
      </div>
      <div><strong>{AUDITED_COMPLETE_GAMES}</strong><span>complete games</span><small>{HR_INTELLIGENCE_CALIBRATION.splits.discovery.start} to {HR_INTELLIGENCE_CALIBRATION.auditedThrough}</small></div>
      <div><strong>{QUALIFIED_FHR_RULES}</strong><span>validated FHR rules</span><small>{HR_INTELLIGENCE_CALIBRATION.minimumSupport.fhr.discoveryGames}+ discovery games required</small></div>
      <div><strong>{QUALIFIED_ANYTIME_RULES}</strong><span>validated anytime rules</span><small>{HR_INTELLIGENCE_CALIBRATION.minimumSupport.anytime.discoveryGames}+ discovery games required</small></div>
      <div><strong>{HR_INTELLIGENCE_CALIBRATION.splits.holdout.completeGames}</strong><span>untouched holdout games</span><small>Audited through {HR_INTELLIGENCE_CALIBRATION.auditedThrough}</small></div>
    </section>

    {error ? <div className={styles.error}><AlertTriangle size={16} /> {error}</div> : null}
    {result && !result.diagnostics.pikkitRowsPresent ? <div className={styles.exposureWarning}>
      <AlertTriangle size={17} />
      <div><strong>Public exposure source unavailable</strong><span>Picks-based qualification is withheld. Market and form diagnostics remain visible for review.</span></div>
    </div> : null}
    {loading ? <div className={styles.loading}><div /><strong>Reconstructing odds, exposure, form, MM, and all signal lanes</strong><span>This can take a moment for a full slate.</span></div> : null}
    {!loading && result && !result.games.length ? <div className={styles.empty}><Target size={28} /><strong>No games found</strong><span>Choose another slate date.</span></div> : null}

    {!loading && result?.games.length ? <>
      <nav className={styles.gameTabs} aria-label="Select game">
        {result.games.map(game => <button type="button" key={game.gamePk} data-active={selectedGame?.gamePk === game.gamePk} data-status={game.recommendation.status} onClick={() => setSelectedGamePk(game.gamePk)}>
          <span><TeamLogo team={game.awayTeam} /><i>at</i><TeamLogo team={game.homeTeam} /></span>
          <strong>{game.awayTeam} @ {game.homeTeam}</strong>
          <small>{game.recommendation.mode.replaceAll('-', ' ')}</small>
        </button>)}
      </nav>
      {selectedGame ? <GameAnalysis key={selectedGame.gamePk} game={selectedGame} /> : null}
    </> : null}
  </main>
}
