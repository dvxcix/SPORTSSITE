'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Activity, AlertTriangle, BarChart3, ChevronDown, Crosshair, EyeOff, RefreshCw, ShieldCheck, Sparkles, Target, Users } from 'lucide-react'
import { mlbHeadshot } from '@slipsurge/core/mlb-api'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import type { HrIntelGameResult, HrIntelPairResult, HrIntelPlayerResult } from '@/lib/hrIntelligence'
import type { HrIntelligenceSlate } from '@/lib/hrIntelligenceData'
import styles from './HrIntelligence.module.css'

const MARKET_LABELS: Record<string, string> = {
  hr2: '2+ HR', laser105: '105+ HR', laser110: '110+ HR', moonshot: 'Moonshot', pa1: '1st PA HR', hrMl: 'HR / ML',
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
  if (value == null) return '—'
  return value > 0 ? `+${value}` : String(value)
}

function signed(value: number | null, suffix = '') {
  if (value == null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function TeamLogo({ team }: { team: string }) {
  const logo = getTeamLogoUrl(team)
  return logo ? <Image src={logo} alt={`${team} logo`} width={28} height={28} unoptimized /> : <span>{team}</span>
}

function PlayerIdentity({ player, role }: { player: HrIntelPlayerResult; role?: string }) {
  return <div className={styles.playerIdentity}>
    <PlayerAvatar headshot={mlbHeadshot(player.mlbId)} teamLogo={getTeamLogoUrl(player.team)} teamAbbr={player.team} name={player.name} size={42} />
    <div><strong>{player.name}</strong><span>{role ? `${role} · ` : ''}{player.team} · #{player.battingOrder} · {player.position}</span></div>
  </div>
}

function RecommendationCard({ player, role, score, icon }: { player: HrIntelPlayerResult | null; role: string; score: number | null; icon: 'anchor' | 'companion' | 'advertised' }) {
  const Icon = icon === 'anchor' ? Crosshair : icon === 'companion' ? Sparkles : EyeOff
  return <article className={styles.recommendationCard} data-kind={icon}>
    <header><span><Icon size={15} /> {role}</span><b>{score == null ? '—' : score.toFixed(1)}</b></header>
    {player ? <>
      <PlayerIdentity player={player} />
      <div className={styles.quickEvidence}>
        <span>FHR {odds(player.fhr.current)}</span><span>HR {odds(player.hr.current)}</span><span>{player.hrPicks ?? '—'} HR picks</span>
      </div>
    </> : <p className={styles.missing}>No qualified player</p>}
  </article>
}

function PairRow({ pair, players, rank }: { pair: HrIntelPairResult; players: Map<number, HrIntelPlayerResult>; rank: number }) {
  const anchor = players.get(pair.anchorMlbId)
  const companion = players.get(pair.companionMlbId)
  if (!anchor || !companion) return null
  return <div className={styles.pairRow}>
    <b className={styles.pairRank}>{rank}</b>
    <div className={styles.pairPlayers}>
      <span><PlayerAvatar headshot={mlbHeadshot(anchor.mlbId)} teamLogo={getTeamLogoUrl(anchor.team)} teamAbbr={anchor.team} name={anchor.name} size={31} /><span><b>{anchor.name}</b><small>FHR anchor</small></span></span>
      <i>+</i>
      <span><PlayerAvatar headshot={mlbHeadshot(companion.mlbId)} teamLogo={getTeamLogoUrl(companion.team)} teamAbbr={companion.team} name={companion.name} size={31} /><span><b>{companion.name}</b><small>Anytime companion</small></span></span>
    </div>
    <div className={styles.pairScore}><strong>{pair.score.toFixed(1)}</strong><small>{pair.exposurePenalty ? `-${pair.exposurePenalty.toFixed(1)} exposure` : 'clean exposure'}</small></div>
  </div>
}

function PlayerDetail({ player }: { player: HrIntelPlayerResult }) {
  return <div className={styles.playerDetail}>
    <div className={styles.evidenceGrid}>{player.evidence.map(item => <div key={item.key} data-tone={item.tone}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
    <section><h4>Market ladder</h4><div className={styles.marketGrid}>{Object.entries(player.markets).map(([key, value]) => <div key={key}><span>{MARKET_LABELS[key] ?? key}</span><strong>{odds(value.open)} <i>→</i> {odds(value.current)}</strong></div>)}</div></section>
    <section><h4>Public exposure by market</h4><div className={styles.marketGrid}>{Object.entries(player.picksByMarket).map(([key, value]) => <div key={key}><span>{PICK_LABELS[key] ?? key}</span><strong>{value ?? '—'}</strong></div>)}</div></section>
    <section><h4>MM and rank windows</h4><div className={styles.windowGrid}>{(['l1', 'l3', 'l5', 'l10'] as const).map(window => <div key={window}><span>{window.toUpperCase()}</span><strong>MM {player.mm?.[window] ?? '—'}</strong><small>Book {player.bookRank?.[window] ?? '—'} · Paper {player.paperRank?.[window] ?? '—'}</small></div>)}</div></section>
  </div>
}

function PlayerBoardRow({ player, expanded, onToggle }: { player: HrIntelPlayerResult; expanded: boolean; onToggle: () => void }) {
  return <div className={styles.playerRowWrap}>
    <button type="button" className={styles.playerRow} onClick={onToggle} aria-expanded={expanded}>
      <span className={styles.order}>{player.battingOrder}</span>
      <PlayerIdentity player={player} />
      <span><small>FHR</small><strong>{odds(player.fhr.current)}</strong><i>{player.fhrTieSize > 1 ? `${player.fhrTieSize}-way tie` : signed(player.fhrBaselineDeltaPct, '%')}</i></span>
      <span><small>Anytime</small><strong>{odds(player.hr.current)}</strong><i>{signed(player.movement.hrImpliedPoints, ' pp')}</i></span>
      <span><small>Public</small><strong>{player.hrPicks ?? '—'}</strong><i>#{player.publicRank ?? '—'}</i></span>
      <span><small>Contact</small><strong>{signed(player.contactAcceleration, '%')}</strong><i>MM {player.mm?.l10 ?? '—'}</i></span>
      <span><small>Role scores</small><strong>{player.fhrScore.toFixed(1)} / {player.anytimeScore.toFixed(1)}</strong><i>FHR / HR</i></span>
      <ChevronDown size={16} className={expanded ? styles.rotated : ''} />
    </button>
    {expanded ? <PlayerDetail player={player} /> : null}
  </div>
}

function GameAnalysis({ game }: { game: HrIntelGameResult }) {
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null)
  const playersById = useMemo(() => new Map(game.players.map(player => [player.mlbId, player])), [game.players])
  const anchor = game.recommendation.fhrAnchorMlbId == null ? null : playersById.get(game.recommendation.fhrAnchorMlbId) ?? null
  const companion = game.recommendation.anytimeCompanionMlbId == null ? null : playersById.get(game.recommendation.anytimeCompanionMlbId) ?? null
  const advertised = game.recommendation.advertisedAlternativeMlbId == null ? null : playersById.get(game.recommendation.advertisedAlternativeMlbId) ?? null
  const away = game.players.filter(player => player.team === game.awayTeam).sort((a, b) => a.battingOrder - b.battingOrder)
  const home = game.players.filter(player => player.team === game.homeTeam).sort((a, b) => a.battingOrder - b.battingOrder)
  const bestPair = game.pairs[0] ?? null

  return <div className={styles.analysis}>
    <section className={styles.signalHeader} data-status={game.recommendation.status}>
      <div><span><ShieldCheck size={14} /> {game.recommendation.status.toUpperCase()}</span><h2>{game.recommendation.confidenceLabel} separation</h2><p>{game.recommendation.reason}</p></div>
      <div className={styles.confidence}><strong>{game.recommendation.confidence.toFixed(1)}</strong><span>Confidence</span></div>
    </section>

    {game.warnings.length ? <div className={styles.warnings}>{game.warnings.map(warning => <p key={warning}><AlertTriangle size={14} /> {warning}</p>)}</div> : null}

    {game.validation ? <section className={styles.validation} data-hit={game.validation.pairHit}>
      <div><span>POSTGAME VALIDATION</span><strong>{game.validation.actualNoHr ? 'No home runs' : `First HR: ${game.validation.firstHrName ?? 'Unknown'}`}</strong><small>Outcomes are displayed after scoring and never enter the model.</small></div>
      <div><b>{game.validation.anchorHit ? 'FHR hit' : 'FHR miss'}</b><b>{game.validation.companionHit ? 'Companion hit' : 'Companion miss'}</b><b>{game.validation.pairHit ? 'Pair hit' : 'Pair missed'}</b></div>
      {!game.validation.actualNoHr ? <p>All HRs: {game.validation.hrNames.join(', ')}</p> : null}
    </section> : null}

    <section className={styles.recommendations}>
      <RecommendationCard player={anchor} role="Hidden FHR anchor" score={anchor?.fhrScore ?? null} icon="anchor" />
      <RecommendationCard player={companion} role="Anytime companion" score={companion?.anytimeScore ?? null} icon="companion" />
      <RecommendationCard player={advertised} role="Advertised alternative" score={advertised?.advertisedScore ?? null} icon="advertised" />
    </section>

    <section className={styles.diagnostics}>
      <div><Target size={17} /><span><strong>{game.diagnostics.pairCount}</strong> pairings scored</span></div>
      <div><Activity size={17} /><span><strong>{game.diagnostics.marketCoveragePct}%</strong> market coverage</span></div>
      <div><Users size={17} /><span><strong>{game.diagnostics.picksCoveragePct}%</strong> pick coverage</span></div>
      <div><EyeOff size={17} /><span><strong>{game.diagnostics.noHrImpliedPct == null ? '—' : `${game.diagnostics.noHrImpliedPct}%`}</strong> No HR implied</span></div>
    </section>

    <div className={styles.contentGrid}>
      <section className={styles.panel}>
        <header><div><span>PAIR LAB</span><h3>Top role-aware pairings</h3></div><small>All {game.diagnostics.pairCount} unordered pairs are scored in both role directions.</small></header>
        <div className={styles.pairList}>{game.pairs.slice(0, 10).map((pair, index) => <PairRow key={`${pair.anchorMlbId}-${pair.companionMlbId}`} pair={pair} players={playersById} rank={index + 1} />)}</div>
        {bestPair ? <div className={styles.pairEvidence}>{bestPair.evidence.map(item => <span key={item.key}>{item.label}: <b>{item.value}</b></span>)}</div> : null}
      </section>

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
      <div><span>ADMIN · PREGAME DECISION TERMINAL</span><h1>HR Intelligence</h1><p>Reconstruct every 18-player board, score both home-run roles, and expose the pair the full market story supports.</p></div>
      <div className={styles.heroMeta}><b>Outcome blind</b><span>No postgame results enter scoring.</span></div>
    </section>

    <section className={styles.controls}>
      <label><span>Slate date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="button" onClick={analyze} disabled={loading || !date}>{loading ? <RefreshCw size={17} className={styles.spin} /> : <BarChart3 size={17} />}{loading ? 'Reconstructing board…' : 'Analyze full slate'}</button>
      {result ? <div><strong>{result.diagnostics.gamesAnalyzed}</strong><span>games analyzed</span></div> : null}
    </section>

    {error ? <div className={styles.error}><AlertTriangle size={16} /> {error}</div> : null}
    {loading ? <div className={styles.loading}><div /><strong>Reconstructing odds, exposure, form, MM, and all pairings</strong><span>This can take a moment for a full slate.</span></div> : null}
    {!loading && result && !result.games.length ? <div className={styles.empty}><Target size={28} /><strong>No games found</strong><span>Choose another slate date.</span></div> : null}

    {!loading && result?.games.length ? <>
      <nav className={styles.gameTabs} aria-label="Select game">
        {result.games.map(game => <button type="button" key={game.gamePk} data-active={selectedGame?.gamePk === game.gamePk} data-status={game.recommendation.status} onClick={() => setSelectedGamePk(game.gamePk)}>
          <span><TeamLogo team={game.awayTeam} /><i>at</i><TeamLogo team={game.homeTeam} /></span>
          <strong>{game.awayTeam} @ {game.homeTeam}</strong>
          <small>{game.recommendation.confidence.toFixed(0)} confidence</small>
        </button>)}
      </nav>
      {selectedGame ? <GameAnalysis key={selectedGame.gamePk} game={selectedGame} /> : null}
    </> : null}
  </main>
}
