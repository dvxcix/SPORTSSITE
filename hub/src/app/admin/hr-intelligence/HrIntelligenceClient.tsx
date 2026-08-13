'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Activity, AlertTriangle, BarChart3, ChevronDown, Crosshair, EyeOff, RefreshCw, Sparkles, Target, Users } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import type { HrIntelGameResult, HrIntelPlayerResult, HrIntelRealizedOutcome } from '@/lib/hrIntelligence'
import type { HrIntelligenceSlate } from '@/lib/hrIntelligenceData'
import styles from './HrIntelligence.module.css'

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
        <span>FHR {odds(player.fhr.current)}</span><span>HR {odds(player.hr.current)}</span><span>{player.hrPicks ?? 'N/A'} HR picks</span><span>{player.diagnosticArchetype.replaceAll('-', ' ')}</span>
      </div>
    </> : <p className={styles.missing}>No qualified player</p>}
  </article>
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
      <span><small>Board read</small><strong>{player.diagnosticFhrScore.toFixed(1)} / {player.diagnosticAnytimeScore.toFixed(1)}</strong><i>{player.diagnosticArchetype.replaceAll('-', ' ')}</i></span>
      <ChevronDown size={16} className={expanded ? styles.rotated : ''} />
    </button>
    {expanded ? <PlayerDetail player={player} /> : null}
  </div>
}

function RealizedOutcomeCard({ outcome }: { outcome: HrIntelRealizedOutcome }) {
  const line = outcome.hits == null
    ? 'Box score unavailable'
    : `${outcome.hits} H · ${outcome.homeRuns} HR · ${outcome.totalBases} TB · ${outcome.rbi} RBI · ${outcome.runs} R · ${outcome.hrr} H+R+RBI`
  return <article className={styles.realizedOutcome}>
    <header>
      <PlayerAvatar headshot={mlbHeadshot(outcome.mlbId)} teamLogo={getTeamLogoUrl(outcome.team)} teamAbbr={outcome.team} name={outcome.name} size={38} />
      <div><strong>{outcome.name}</strong><span>{outcome.team} · {outcome.firstHr ? 'First HR' : 'Anytime HR'}</span></div>
      {outcome.grandSlam ? <b>GRAND SLAM</b> : null}
    </header>
    <p>{line}</p>
    <small>{outcome.maxHrSwingRbi} RBI on the largest HR swing{outcome.additionalHit ? ' · additional hit recorded' : outcome.onlyHitWasHr ? ' · homer was the only hit' : ''}</small>
    <div className={styles.settlementRows}>
      <div><span>Cashed</span>{outcome.cashedMarkets.map(market => <i key={market}>{market}</i>)}</div>
      <div><span>Missed</span>{outcome.missedMarkets.map(market => <i key={market}>{market}</i>)}</div>
    </div>
  </article>
}

function GameAnalysis({ game }: { game: HrIntelGameResult }) {
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null)
  const playersById = useMemo(() => new Map(game.players.map(player => [player.mlbId, player])), [game.players])
  const getPlayer = (id: number | null) => id == null ? null : playersById.get(id) ?? null
  const decisionAnchor = getPlayer(game.recommendation.boardFhrMlbId)
  const decisionCompanion = getPlayer(game.recommendation.boardCompanionMlbId)
  const decisionPlayers = [decisionAnchor, decisionCompanion].filter((player): player is HrIntelPlayerResult => !!player)
  const realizedHrIds = new Set(game.validation?.realizedHrOutcomes.map(outcome => outcome.mlbId) ?? [])
  const pairHitCount = decisionPlayers.filter(player => realizedHrIds.has(player.mlbId)).length
  const away = game.players.filter(player => player.team === game.awayTeam).sort((a, b) => a.battingOrder - b.battingOrder)
  const home = game.players.filter(player => player.team === game.homeTeam).sort((a, b) => a.battingOrder - b.battingOrder)

  return <div className={styles.analysis}>
    {game.warnings.length ? <div className={styles.warnings}>{game.warnings.map(warning => <p key={warning}><AlertTriangle size={14} /> {warning}</p>)}</div> : null}

    <section className={styles.decision}>
      <header>
        <div><span>TWO-LANE REDUCTION | {game.diagnostics.gameRegime.replaceAll('-', ' ')}</span><h3>{decisionAnchor && decisionCompanion ? `${decisionAnchor.name} + ${decisionCompanion.name}` : 'Complete board required'}</h3></div>
        <small>Exactly two names from the 18-player board. One is the strongest market and form anchor. The other is the strongest structural dislocation. Either player homering counts.</small>
      </header>
      <div className={styles.decisionPlayers}>
        <SignalCard player={decisionAnchor} role="Market and form anchor" score={game.recommendation.boardFhrScore} kind="diagnostic" />
        <SignalCard player={decisionCompanion} role={game.recommendation.boardCompanionLane?.replaceAll('-', ' ') ?? 'Structural dislocation'} score={game.recommendation.boardCompanionScore} kind="contradiction" />
      </div>
      <p>The reduction compares all 18 players across prices, movement, exposure, payoff markets, MM, Statcast, clusters, and cross-book structure.</p>
    </section>

    {game.validation ? <section className={styles.validation} data-score={pairHitCount}>
      <div className={styles.pairGrade}><strong>{pairHitCount}/2</strong><span>Pair result</span></div>
      <div className={styles.validationSummary}><span>POSTGAME SCORECARD</span><strong>{game.validation.actualNoHr ? 'No home runs in this game' : `First HR: ${game.validation.firstHrName ?? 'Unknown'}`}</strong><small>Results are attached only after the game and never enter the pregame calculation.</small></div>
      <div className={styles.selectionResults}>{decisionPlayers.map((player, index) => <b key={player.mlbId} data-hit={realizedHrIds.has(player.mlbId)}>{index + 1}. {player.name} | {realizedHrIds.has(player.mlbId) ? 'HR' : 'No HR'}</b>)}</div>
      {!game.validation.actualNoHr && game.validation.realizedHrOutcomes.length ? <details className={styles.outcomeDetails}><summary>Open all realized HR settlements</summary><div className={styles.realizedGrid}>{game.validation.realizedHrOutcomes.map(outcome => <RealizedOutcomeCard key={outcome.mlbId} outcome={outcome} />)}</div></details> : null}
    </section> : null}

    <details className={styles.auditDetails}>
      <summary>Open model diagnostics</summary>
      <section className={styles.diagnostics}>
        <div><Crosshair size={17} /><span><strong>{game.diagnostics.gameRegime.replaceAll('-', ' ')}</strong> game regime</span></div>
        <div><Target size={17} /><span><strong>{game.diagnostics.boardProfile}</strong> board profile</span></div>
        <div><Activity size={17} /><span><strong>{game.diagnostics.marketCoveragePct}%</strong> market coverage</span></div>
        <div><Users size={17} /><span><strong>{game.diagnostics.picksCoveragePct}%</strong> HR pick coverage</span></div>
        <div><Users size={17} /><span><strong>{game.diagnostics.crossMarketPicksCoveragePct}%</strong> cross-market coverage</span></div>
        <div><EyeOff size={17} /><span><strong>{game.diagnostics.noHrImpliedPct == null ? 'N/A' : `${game.diagnostics.noHrImpliedPct}%`}</strong> No HR implied</span></div>
      </section>
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
  const slateScore = useMemo(() => {
    const gradedGames = result?.games.filter(game => game.validation) ?? []
    let playerHits = 0
    let gamesWithHit = 0
    for (const game of gradedGames) {
      const homerIds = new Set(game.validation?.realizedHrOutcomes.map(outcome => outcome.mlbId) ?? [])
      const selectedIds = [game.recommendation.boardFhrMlbId, game.recommendation.boardCompanionMlbId]
        .filter((id): id is number => id != null)
      const hits = selectedIds.filter(id => homerIds.has(id)).length
      playerHits += hits
      if (hits > 0) gamesWithHit += 1
    }
    return { gradedGames: gradedGames.length, gamesWithHit, playerHits, playerReads: gradedGames.length * 2 }
  }, [result])

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
      <div><span>ADMIN | TWO-LANE DECISION TERMINAL</span><h1>HR Intelligence</h1><p>Reduce every complete 18-player board to one credible anchor and one structural dislocation, then grade that exact pair after the game.</p></div>
      <div className={styles.heroMeta}><b>Outcome blind</b><span>Postgame results never enter scoring.</span></div>
    </section>

    <section className={styles.controls}>
      <label><span>Slate date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" onClick={analyze} disabled={loading || !date}>{loading ? <RefreshCw size={17} className={styles.spin} /> : <BarChart3 size={17} />}{loading ? 'Reconstructing board...' : 'Analyze full slate'}</button>
      {result ? <div><strong>{result.diagnostics.gamesAnalyzed}</strong><span>games analyzed</span></div> : null}
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
      {slateScore.gradedGames ? <section className={styles.slateScoreboard}>
        <div><span>SLATE SCORECARD</span><strong>{slateScore.gamesWithHit}/{slateScore.gradedGames}</strong><small>games with at least one selected HR</small></div>
        <div><strong>{slateScore.playerHits}/{slateScore.playerReads}</strong><span>individual player reads hit</span></div>
        <div><strong>{Math.round((slateScore.gamesWithHit / slateScore.gradedGames) * 100)}%</strong><span>one-of-two game coverage</span></div>
      </section> : null}
      {selectedGame ? <GameAnalysis key={selectedGame.gamePk} game={selectedGame} /> : null}
    </> : null}
  </main>
}
