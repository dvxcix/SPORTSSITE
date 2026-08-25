'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity, BarChart3, ChevronRight, Crosshair,
  Database, Film, Goal, LoaderCircle, Pause, Play, Radio, Route, Search, Shield, Sparkles, Target, Wind,
} from 'lucide-react'
import styles from './sideline.module.css'
import { SlipSurgeScoreLabel } from '@/components/ui/SlipSurgeScoreLabel'

export type Team = { abbr: string; name: string; color: string; logo: string | null }

export type SidelineGame = {
  id: string
  season: number
  week: number
  gameType: string
  gameday: string
  gametime: string | null
  stadium: string | null
  roof: string | null
  surface: string | null
  away: Team
  home: Team
}

export type SidelineHistoricalGame = {
  id: string
  season: number
  week: number
  gameType: string
  gameday: string
  away: Team
  home: Team
  awayScore: number
  homeScore: number
}

export type SidelinePlay = {
  id: string
  gameId: string
  playId: number
  offense: string
  defense: string
  quarter: number
  clock: string
  down: number
  distance: number
  yardline: number
  playType: 'pass' | 'run'
  description: string
  yards: number
  airYards: number
  yardsAfterCatch: number
  passLocation: string | null
  runLocation: string | null
  runGap: string | null
  complete: boolean
  firstDown: boolean
  touchdown: boolean
  turnover: boolean
  success: boolean
  explosive: boolean
  epa: number
  scoreOffense: number
  scoreDefense: number
  playerId: string | null
  playerName: string | null
  playerRole: 'TARGET' | 'RUSHER'
  playerHeadshot: string | null
  passerId: string | null
  passerName: string | null
  passerHeadshot: string | null
}

export type SidelineTeamProfile = {
  team: Team
  plays: number
  passRate: number
  neutralPassRate: number
  shotgunRate: number
  noHuddleRate: number
  successRate: number
  explosiveRate: number
  redZoneTdRate: number
  thirdDownRate: number
  defenseSuccessAllowed: number
  defenseExplosiveAllowed: number
}

export type SidelinePlayer = {
  id: string
  name: string
  team: string
  position: string
  headshot: string | null
  index: number
  volume: number
  geometry: number
  redZone: number
  breakaway: number
  evidence: number
  targets: number
  carries: number
  targetShare: number
  carryShare: number
  airYards: number
  separation: number
  redZoneLooks: number
  lane: string
  opponent: string
  games: number
  projections: SidelineProjection[]
}

export type SidelineProjection = {
  key: 'receptions' | 'receiving-yards' | 'rush-attempts' | 'rushing-yards' | 'pass-attempts' | 'completions' | 'passing-yards' | 'touchdown'
  label: string
  mean: number
  low: number
  high: number
  unit: string
  matchup: number
  pace: number
  confidence: number
  baseline: number
  recent3: number
  recent5: number
  hitRate: number
}

export type SidelineTarget = {
  id: string
  playId: number
  playerId: string
  playerName: string
  team: string
  defense: string
  gameId: string
  homeTeam: string
  awayTeam: string
  quarter: number
  clock: string
  down: number
  distance: number
  yardline: number
  description: string
  side: 'left' | 'middle' | 'right'
  airYards: number
  yards: number
  yac: number
  complete: boolean
  touchdown: boolean
  explosive: boolean
}

export type SidelineLens = {
  season: number
  plays: number
  status: 'calculated' | 'awaiting-data'
  headline: string
  headlineDetail: string
  aggressor: string
  teams: SidelineTeamProfile[]
  players: SidelinePlayer[]
  historicalGames: SidelineHistoricalGame[]
  historicalPlays: SidelinePlay[]
  targets: SidelineTarget[]
}

type View = 'props' | 'routes' | 'film' | 'team-dna' | 'red-zone'

const views: { id: View; label: string; icon: typeof Film }[] = [
  { id: 'props', label: 'Prop Command', icon: Target },
  { id: 'routes', label: 'Route Atlas', icon: Route },
  { id: 'film', label: 'Historic Matchup', icon: Film },
  { id: 'team-dna', label: 'Team DNA', icon: BarChart3 },
  { id: 'red-zone', label: 'Red Zone', icon: Goal },
]

function TeamLogo({ team, compact = false }: { team: Team; compact?: boolean }) {
  if (team.logo) return <Image className={compact ? styles.teamLogoCompact : styles.teamLogo} src={team.logo} alt={`${team.name} logo`} width={compact ? 34 : 58} height={compact ? 34 : 58} unoptimized />
  return <span className={compact ? styles.teamFallbackCompact : styles.teamFallback} style={{ background: team.color }}>{team.abbr.slice(0, 2)}</span>
}

function PlayerAvatar({ src, name, size = 'normal' }: { src: string | null; name: string; size?: 'small' | 'normal' | 'large' }) {
  const initials = name.split(' ').map(part => part[0]).join('').slice(0, 2)
  return <span className={`${styles.playerAvatar} ${styles[`playerAvatar_${size}`]}`}>{src ? <Image src={src} alt={`${name} headshot`} width={size === 'large' ? 94 : size === 'small' ? 42 : 62} height={size === 'large' ? 94 : size === 'small' ? 42 : 62} unoptimized /> : <b>{initials}</b>}</span>
}

function numberTone(value: number) {
  if (value >= 72) return styles.scoreStrong
  if (value >= 55) return styles.scoreWatch
  return styles.scoreQuiet
}

function ordinal(value: number) {
  if (value === 1) return '1ST'
  if (value === 2) return '2ND'
  if (value === 3) return '3RD'
  return `${value}TH`
}

function locationX(play: SidelinePlay) {
  const location = (play.passLocation ?? play.runLocation ?? '').toLowerCase()
  if (location === 'left') return 30
  if (location === 'right') return 70
  return 50
}

function ActualPlayField({ play, teams }: { play: SidelinePlay; teams: Team[] }) {
  const offense = teams.find(team => team.abbr === play.offense)
  const defense = teams.find(team => team.abbr === play.defense)
  const losY = Math.min(88, Math.max(20, 12 + play.yardline * .75))
  const scale = .72
  const gainY = Math.max(10, losY - Math.max(0, play.distance) * scale)
  const resultY = Math.min(92, Math.max(8, losY - play.yards * scale))
  const targetX = locationX(play)
  const airY = Math.min(92, Math.max(8, losY - play.airYards * scale))
  const outcome = play.touchdown ? 'TOUCHDOWN' : play.turnover ? 'TURNOVER' : play.firstDown ? 'FIRST DOWN' : `${play.yards >= 0 ? '+' : ''}${play.yards} YARDS`

  return (
    <div className={styles.replayField}>
      <div className={styles.endZone} style={{ background: offense?.color ?? '#203824' }}><span>{offense?.abbr ?? play.offense} END ZONE</span></div>
      {[20, 40, 50, 60, 80].map(yard => <div key={yard} className={styles.verticalYardLine} style={{ top: `${12 + yard * .75}%` }}><span>{yard <= 50 ? yard : 100 - yard}</span><span>{yard <= 50 ? yard : 100 - yard}</span></div>)}
      <div className={styles.lineToGain} style={{ top: `${gainY}%` }}><span>TO GAIN</span></div>
      <div className={styles.replayLos} style={{ top: `${losY}%` }}><span>LOS</span></div>
      <svg className={styles.playTrace} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Recorded play outcome trace">
        {play.playType === 'pass' ? <><path className={styles.throwTrace} d={`M 50 ${losY} Q 50 ${(losY + airY) / 2} ${targetX} ${airY}`} />{play.complete && Math.abs(resultY - airY) > 1 && <path className={styles.yacTrace} d={`M ${targetX} ${airY} L ${targetX} ${resultY}`} />}</> : <path className={styles.runTrace} d={`M 50 ${losY} Q ${targetX} ${(losY + resultY) / 2} ${targetX} ${resultY}`} />}
        <circle className={play.turnover ? styles.resultTurnover : play.success ? styles.resultGood : styles.resultNeutral} cx={targetX} cy={resultY} r="1.8" />
      </svg>
      <div className={styles.qbToken} style={{ top: `${Math.min(93, losY + 5)}%` }}>{play.passerHeadshot ? <Image src={play.passerHeadshot} alt="" width={38} height={38} unoptimized /> : <span>QB</span>}</div>
      <div className={styles.resultToken} style={{ left: `${targetX}%`, top: `${resultY}%` }}>{play.playerHeadshot ? <Image src={play.playerHeadshot} alt="" width={46} height={46} unoptimized /> : <span>{play.playerRole === 'TARGET' ? 'WR' : 'RB'}</span>}</div>
      <div className={styles.playOutcome}><small>{play.offense} BALL</small><strong>{outcome}</strong><span>{play.playType.toUpperCase()} · EPA {play.epa > 0 ? '+' : ''}{play.epa.toFixed(2)}</span></div>
      <div className={styles.directionBadge}>OFFENSE MOVING <b>↑</b></div>
      {defense && <div className={styles.defenseBadge}><TeamLogo team={defense} compact /><span>vs {defense.abbr}</span></div>}
    </div>
  )
}

function GameSelector({ games, selected, onSelect, loadingId }: { games: SidelineHistoricalGame[]; selected: string; onSelect: (id: string) => void; loadingId: string }) {
  return <div className={styles.historyGames}>{games.map(game => <button key={game.id} type="button" className={selected === game.id ? styles.historyGameActive : styles.historyGame} onClick={() => onSelect(game.id)} disabled={Boolean(loadingId)}><div><TeamLogo team={game.away} compact /><span>{game.away.abbr}</span><b>{game.awayScore}</b></div><div><TeamLogo team={game.home} compact /><span>{game.home.abbr}</span><b>{game.homeScore}</b></div><small>{new Date(`${game.gameday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {game.gameType} W{game.week}</small>{loadingId === game.id && <LoaderCircle className={styles.spin} size={16} />}</button>)}</div>
}

function FilmRoom({ lens }: { lens: SidelineLens }) {
  const initialGameId = lens.historicalPlays[0]?.gameId ?? lens.historicalGames[0]?.id ?? ''
  const [gameId, setGameId] = useState(initialGameId)
  const [playId, setPlayId] = useState('')
  const [team, setTeam] = useState('ALL')
  const [type, setType] = useState<'all' | 'pass' | 'run'>('all')
  const [onlyImpact, setOnlyImpact] = useState(false)
  const [seasonFilter, setSeasonFilter] = useState('ALL')
  const [teamFilter, setTeamFilter] = useState('ALL')
  const [archiveSearch, setArchiveSearch] = useState('')
  const [loadingGameId, setLoadingGameId] = useState('')
  const [loadError, setLoadError] = useState('')
  const [playsByGame, setPlaysByGame] = useState<Record<string, SidelinePlay[]>>(() => initialGameId ? { [initialGameId]: lens.historicalPlays } : {})

  const game = lens.historicalGames.find(item => item.id === gameId) ?? lens.historicalGames[0]
  const seasons = useMemo(() => Array.from(new Set(lens.historicalGames.map(item => item.season))).sort((a, b) => b - a), [lens.historicalGames])
  const archiveTeams = useMemo(() => {
    const byAbbr = new Map<string, Team>()
    lens.historicalGames.forEach(item => { byAbbr.set(item.away.abbr, item.away); byAbbr.set(item.home.abbr, item.home) })
    return Array.from(byAbbr.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [lens.historicalGames])
  const filteredGames = useMemo(() => {
    const query = archiveSearch.trim().toLowerCase()
    return lens.historicalGames.filter(item => {
      const seasonMatch = seasonFilter === 'ALL' || String(item.season) === seasonFilter
      const teamMatch = teamFilter === 'ALL' || item.away.abbr === teamFilter || item.home.abbr === teamFilter
      const searchMatch = !query || `${item.away.name} ${item.away.abbr} ${item.home.name} ${item.home.abbr}`.toLowerCase().includes(query)
      return seasonMatch && teamMatch && searchMatch
    })
  }, [archiveSearch, lens.historicalGames, seasonFilter, teamFilter])
  const currentGamePlays = useMemo(() => playsByGame[game?.id ?? ''] ?? [], [game?.id, playsByGame])
  const plays = useMemo(() => currentGamePlays.filter(play => (team === 'ALL' || play.offense === team) && (type === 'all' || play.playType === type) && (!onlyImpact || play.explosive || play.touchdown || play.turnover)), [currentGamePlays, onlyImpact, team, type])
  const selectedPlay = plays.find(play => play.id === playId) ?? plays[0]

  const selectHistoricalGame = async (id: string) => {
    setGameId(id)
    setPlayId('')
    setTeam('ALL')
    setLoadError('')
    if (playsByGame[id]) return
    setLoadingGameId(id)
    try {
      const response = await fetch(`/api/the-sideline/history/${encodeURIComponent(id)}`)
      if (!response.ok) throw new Error('Unable to load this game')
      const payload = await response.json() as { plays?: SidelinePlay[] }
      setPlaysByGame(current => ({ ...current, [id]: payload.plays ?? [] }))
    } catch {
      setLoadError('That game could not be loaded. Try another matchup.')
    } finally {
      setLoadingGameId('')
    }
  }

  if (!game) return <EmptyState title="Historical archive is syncing" copy="Completed games will appear here as soon as the NFL tables finish loading." />
  const impactCount = plays.filter(play => play.explosive || play.touchdown || play.turnover).length

  return (
    <section className={styles.filmSuite}>
      <div className={styles.sectionHead}><div><span>FULL HISTORICAL ARCHIVE</span><h2>Historic Matchup</h2><p>Select any loaded season, team or game. Every pass and rush below came from that actual matchup.</p></div><div className={styles.sourcePills}><b><Database size={13} /> Recorded PBP</b><span><Route size={13} /> Direction + depth</span></div></div>
      <div className={styles.archiveControls}>
        <label><span>SEASON</span><select value={seasonFilter} onChange={event => setSeasonFilter(event.target.value)}><option value="ALL">All seasons</option>{seasons.map(season => <option key={season} value={season}>{season}</option>)}</select></label>
        <label><span>TEAM</span><select value={teamFilter} onChange={event => setTeamFilter(event.target.value)}><option value="ALL">All teams</option>{archiveTeams.map(item => <option key={item.abbr} value={item.abbr}>{item.name}</option>)}</select></label>
        <label className={styles.archiveSearch}><span>MATCHUP SEARCH</span><div><Search size={16} /><input value={archiveSearch} onChange={event => setArchiveSearch(event.target.value)} placeholder="Search team or abbreviation" /></div></label>
        <div className={styles.archiveCount}><b>{filteredGames.length}</b><span>games found</span></div>
      </div>
      <GameSelector games={filteredGames.slice(0, 80)} selected={game.id} onSelect={selectHistoricalGame} loadingId={loadingGameId} />
      {loadError && <div className={styles.archiveError}>{loadError}</div>}
      <div className={styles.filmToolbar}>
        <div className={styles.segmented}>{['ALL', game.away.abbr, game.home.abbr].map(item => <button type="button" className={team === item ? styles.segmentActive : ''} key={item} onClick={() => { setTeam(item); setPlayId('') }}>{item}</button>)}</div>
        <div className={styles.segmented}>{(['all', 'pass', 'run'] as const).map(item => <button type="button" className={type === item ? styles.segmentActive : ''} key={item} onClick={() => { setType(item); setPlayId('') }}>{item.toUpperCase()}</button>)}</div>
        <button type="button" className={onlyImpact ? styles.impactActive : styles.impactToggle} onClick={() => { setOnlyImpact(value => !value); setPlayId('') }}><Sparkles size={14} /> Impact plays</button>
        <span className={styles.resultCount}>{plays.length} plays · {impactCount} impact</span>
      </div>
      {!selectedPlay ? <div className={styles.archiveLoading}>{loadingGameId ? <><LoaderCircle className={styles.spin} size={24} /><strong>Loading recorded plays</strong><span>Rebuilding this historical matchup from play-by-play.</span></> : <><Database size={24} /><strong>No matching plays</strong><span>Clear a play filter or choose another game.</span></>}</div> : <div className={styles.filmGrid}>
        <div className={styles.playList}>{plays.map(play => <button key={play.id} type="button" className={selectedPlay.id === play.id ? styles.playRowActive : styles.playRow} onClick={() => setPlayId(play.id)}><span className={styles.playDown}>{ordinal(play.down)}<small>&amp; {play.distance}</small></span><span className={styles.playCopy}><small>Q{play.quarter} · {play.clock} · {play.offense}</small><strong>{play.playerName ?? (play.playType === 'pass' ? 'Pass' : 'Rush')}</strong><em>{play.yards >= 0 ? '+' : ''}{play.yards} YDS · {play.playType.toUpperCase()}</em></span><span className={play.touchdown ? styles.playTagTd : play.turnover ? styles.playTagBad : play.explosive ? styles.playTagBig : styles.playTag}>{play.touchdown ? 'TD' : play.turnover ? 'TO' : play.explosive ? 'BIG' : play.success ? 'WIN' : '—'}</span></button>)}</div>
        <div className={styles.replayStage}><ActualPlayField play={selectedPlay} teams={[game.away, game.home]} /><div className={styles.replayLegend}><span><i className={styles.traceThrow} /> Recorded throw / rush direction</span><span><i className={styles.traceYac} /> Recorded yards after catch</span><strong>No GPS path claimed</strong></div></div>
        <aside className={styles.playInspector}>
          <div className={styles.inspectorScore}><div><TeamLogo team={game.away} compact /><strong>{game.away.abbr}</strong><b>{game.awayScore}</b></div><span>FINAL</span><div><b>{game.homeScore}</b><strong>{game.home.abbr}</strong><TeamLogo team={game.home} compact /></div></div>
          <div className={styles.inspectorPlayer}><PlayerAvatar src={selectedPlay.playerHeadshot} name={selectedPlay.playerName ?? 'Ball carrier'} size="large" /><div><small>{selectedPlay.playerRole}</small><strong>{selectedPlay.playerName ?? 'Recorded player unavailable'}</strong><span>{selectedPlay.offense} vs {selectedPlay.defense}</span></div></div>
          <div className={styles.situationLine}><b>Q{selectedPlay.quarter} {selectedPlay.clock}</b><span>{ordinal(selectedPlay.down)} &amp; {selectedPlay.distance}</span><span>{selectedPlay.yardline > 50 ? `OWN ${100 - selectedPlay.yardline}` : selectedPlay.yardline === 50 ? '50' : `OPP ${selectedPlay.yardline}`}</span></div>
          <p className={styles.playDescription}>{selectedPlay.description}</p>
          <div className={styles.playMetrics}><div><small>RESULT</small><b>{selectedPlay.yards >= 0 ? '+' : ''}{selectedPlay.yards}</b><span>yards</span></div><div><small>EPA</small><b className={selectedPlay.epa >= 0 ? styles.metricGood : styles.metricBad}>{selectedPlay.epa > 0 ? '+' : ''}{selectedPlay.epa.toFixed(2)}</b><span>play value</span></div><div><small>{selectedPlay.playType === 'pass' ? 'AIR / YAC' : 'LANE'}</small><b>{selectedPlay.playType === 'pass' ? `${selectedPlay.airYards} / ${selectedPlay.yardsAfterCatch}` : (selectedPlay.runLocation ?? '—').toUpperCase()}</b><span>{selectedPlay.playType === 'pass' ? 'yards' : selectedPlay.runGap ?? 'recorded'}</span></div><div><small>OUTCOME</small><b>{selectedPlay.touchdown ? 'TD' : selectedPlay.turnover ? 'TURNOVER' : selectedPlay.firstDown ? '1ST' : selectedPlay.success ? 'WIN' : 'LOSS'}</b><span>down result</span></div></div>
          <div className={styles.dataTruth}><Shield size={16} /><div><b>What is real here</b><span>Situation, description, direction, air yards, YAC, result and EPA are recorded. The line is a scaled replay of those outcomes—not player-tracking coordinates.</span></div></div>
        </aside>
      </div>}
    </section>
  )
}

function EmptyState({ title = 'Historical layer is syncing', copy = 'The live matchup shell is ready. NFL data will populate this view when available.' }: { title?: string; copy?: string }) {
  return <div className={styles.emptyState}><Radio size={22} /><strong>{title}</strong><span>{copy}</span></div>
}

function TeamDnaView({ lens }: { lens: SidelineLens }) {
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>{lens.season} SEASON SAMPLE</span><h2>Team DNA</h2><p>Play-level tendencies from the current matchup teams.</p></div><Activity size={22} /></div><div className={styles.dnaGrid}>{lens.teams.map(profile => <article className={styles.dnaCard} key={profile.team.abbr}><div className={styles.dnaTeam}><TeamLogo team={profile.team} /><div><small>{profile.plays.toLocaleString()} PLAYS</small><strong>{profile.team.name}</strong><span>{profile.team.abbr}</span></div></div><div className={styles.dnaHero}><small>NEUTRAL-DOWN PASS RATE</small><b>{profile.neutralPassRate.toFixed(1)}%</b></div><div className={styles.dnaStats}><div><b>{profile.shotgunRate.toFixed(1)}%</b><span>Shotgun</span></div><div><b>{profile.successRate.toFixed(1)}%</b><span>Success</span></div><div><b>{profile.explosiveRate.toFixed(1)}%</b><span>Explosive</span></div><div><b>{profile.redZoneTdRate.toFixed(1)}%</b><span>RZ TD</span></div><div><b>{profile.thirdDownRate.toFixed(1)}%</b><span>3rd down</span></div><div><b>{profile.defenseExplosiveAllowed.toFixed(1)}%</b><span>Explosive allowed</span></div></div></article>)}</div></section>
}

function projectionValue(projection: SidelineProjection) {
  if (projection.key === 'touchdown') return `${Math.round(projection.mean)}%`
  return projection.mean < 10 ? projection.mean.toFixed(1) : Math.round(projection.mean).toString()
}

function projectionFit(player: SidelinePlayer, projection: SidelineProjection) {
  const trendBase = Math.max(projection.baseline, 0.5)
  const trend = Math.max(-20, Math.min(20, ((projection.recent3 - projection.baseline) / trendBase) * 100))
  return player.index * .34 + projection.confidence * .26 + projection.hitRate * .16 + projection.matchup * .34 + projection.pace * .18 + trend * .12
}

function PropCommand({ lens }: { lens: SidelineLens }) {
  const [team, setTeam] = useState('ALL')
  const [market, setMarket] = useState<'all' | SidelineProjection['key']>('all')
  const players = useMemo(() => lens.players.filter(player => team === 'ALL' || player.team === team).map(player => ({
    player,
    projections: player.projections.filter(projection => market === 'all' || projection.key === market),
  })).filter(item => item.projections.length).sort((a, b) => Math.max(...b.projections.map(item => projectionFit(b.player, item))) - Math.max(...a.projections.map(item => projectionFit(a.player, item)))), [lens.players, market, team])
  const marketOptions: { key: typeof market; label: string }[] = [
    { key: 'all', label: 'Best fit' }, { key: 'receptions', label: 'Receptions' }, { key: 'receiving-yards', label: 'Rec yards' },
    { key: 'rush-attempts', label: 'Carries' }, { key: 'rushing-yards', label: 'Rush yards' }, { key: 'pass-attempts', label: 'Pass attempts' },
    { key: 'completions', label: 'Completions' }, { key: 'passing-yards', label: 'Pass yards' }, { key: 'touchdown', label: 'Touchdowns' },
  ]
  const teams = lens.teams.map(item => item.team.abbr)

  return <section className={styles.fullPanel}>
    <div className={styles.sectionHead}><div><span>MATCHUP-ADJUSTED OUTCOMES</span><h2>Prop Command</h2><p>Player baseline, opponent allowance, role, pace and scoring-area work converted into an expected stat line and a practical game range.</p></div><Target size={24} /></div>
    <div className={styles.propToolbar}><div className={styles.segmented}>{['ALL', ...teams].map(item => <button key={item} type="button" className={team === item ? styles.segmentActive : ''} onClick={() => setTeam(item)}>{item}</button>)}</div><div className={styles.propMarkets}>{marketOptions.map(item => <button key={item.key} type="button" className={market === item.key ? styles.propMarketActive : ''} onClick={() => setMarket(item.key)}>{item.label}</button>)}</div></div>
    <div className={styles.projectionGrid}>{players.map(({ player, projections }, rank) => <article className={styles.projectionCard} key={player.id}>
      <div className={styles.projectionIdentity}><span>#{rank + 1}</span><PlayerAvatar src={player.headshot} name={player.name} size="large" /><div><small>{player.team} {player.position} · vs {player.opponent}</small><strong>{player.name}</strong><em>{player.lane} · {player.games} games</em></div><b className={numberTone(player.index)}>{player.index}</b></div>
      <div className={styles.projectionRows}>{[...projections].sort((a, b) => projectionFit(player, b) - projectionFit(player, a)).slice(0, market === 'all' ? 3 : 1).map(projection => <div className={styles.projectionRow} key={projection.key}>
        <div><small>{projection.label}</small><strong>{projectionValue(projection)}<span>{projection.unit}</span></strong></div>
        <div className={styles.rangeRail}><i style={{ left: `${Math.max(3, 50 - projection.confidence / 3)}%`, width: `${Math.min(76, 24 + projection.confidence / 1.8)}%` }} /><b>EXPECTED RANGE {projection.low.toFixed(projection.low < 10 ? 1 : 0)}-{projection.high.toFixed(projection.high < 10 ? 1 : 0)}</b></div>
        <div className={projection.matchup + projection.pace >= 0 ? styles.matchupGood : styles.matchupBad}><small>GAME FIT</small><b>{projection.matchup + projection.pace > 0 ? '+' : ''}{(projection.matchup + projection.pace).toFixed(1)}%</b></div>
        <div className={styles.projectionEvidence}><span><small>BASE</small><b>{projection.baseline.toFixed(projection.baseline < 10 ? 1 : 0)}</b></span><span><small>L3</small><b>{projection.recent3.toFixed(projection.recent3 < 10 ? 1 : 0)}</b></span><span><small>L5</small><b>{projection.recent5.toFixed(projection.recent5 < 10 ? 1 : 0)}</b></span><span><small>OVER AVG</small><b>{Math.round(projection.hitRate)}%</b></span></div>
      </div>)}</div>
      <div className={styles.projectionFoot}><span><b>{player.targetShare.toFixed(1)}%</b> target share</span><span><b>{player.carryShare.toFixed(1)}%</b> carry share</span><span><b>{player.airYards.toFixed(1)}</b> aDOT</span><span><b>{player.redZoneLooks}</b> red-zone looks</span></div>
    </article>)}</div>
    {!players.length && <EmptyState title="No players fit this filter" copy="Switch the team or market filter to restore the matchup projections." />}
    <div className={styles.modelNote}><Shield size={18} /><div><strong>Projection, not a sportsbook line.</strong><span>Expected output blends season form, L3/L5 direction, the player&apos;s recorded game distribution, opponent positional allowance and matchup pace.</span></div></div>
  </section>
}

const fieldClamp = (value: number) => Math.max(10, Math.min(110, value))

function targetCoordinates(target: SidelineTarget) {
  const los = fieldClamp(10 + 100 - target.yardline)
  const x = fieldClamp(los + target.airYards)
  const y = target.side === 'left' ? 14 : target.side === 'right' ? 39.3 : 26.65
  return { x, y, los }
}

function fieldPosition(target: SidelineTarget) {
  if (target.yardline === 50) return '50'
  return target.yardline > 50 ? `${target.team} ${100 - target.yardline}` : `${target.defense} ${target.yardline}`
}

function RouteAtlasField({ lens }: { lens: SidelineLens }) {
  const eligible = useMemo(() => lens.players.filter(player => lens.targets.some(target => target.playerId === player.id)), [lens.players, lens.targets])
  const [playerId, setPlayerId] = useState(eligible[0]?.id ?? '')
  const [defense, setDefense] = useState('ALL')
  const [depth, setDepth] = useState<'all' | 'short' | 'deep'>('all')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(999)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const player = eligible.find(item => item.id === playerId) ?? eligible[0]
  const targets = useMemo(() => lens.targets
    .filter(target => target.playerId === player?.id && (defense === 'ALL' || target.defense === defense) && (depth === 'all' || (depth === 'deep' ? target.airYards >= 15 : target.airYards < 15)))
    .sort((a, b) => a.gameId.localeCompare(b.gameId) || a.playId - b.playId)
    .slice(-90), [defense, depth, lens.targets, player?.id])
  const visible = playing ? targets.slice(0, Math.min(cursor, targets.length)) : targets
  const defenses = useMemo(() => Array.from(new Set(lens.targets.filter(target => target.playerId === player?.id).map(target => target.defense))).sort(), [lens.targets, player?.id])
  const activeIndex = Math.max(0, Math.min(selectedIndex, targets.length - 1))
  const selectedTarget = targets[activeIndex]
  const targetGame = selectedTarget ? lens.historicalGames.find(game => game.id === selectedTarget.gameId) : undefined
  const fieldHome = targetGame?.home ?? lens.teams.find(item => item.team.abbr === selectedTarget?.homeTeam)?.team ?? lens.teams[1]?.team
  const fieldAway = targetGame?.away ?? lens.teams.find(item => item.team.abbr === selectedTarget?.awayTeam)?.team ?? lens.teams[0]?.team
  const selectedPoint = selectedTarget ? targetCoordinates(selectedTarget) : null
  const lineToGain = selectedTarget && selectedPoint ? fieldClamp(selectedPoint.los + Math.min(selectedTarget.distance, selectedTarget.yardline)) : 10
  const resultX = selectedTarget && selectedPoint ? (selectedTarget.touchdown ? 115 : fieldClamp(selectedPoint.los + selectedTarget.yards)) : 10

  useEffect(() => {
    if (!playing || cursor >= targets.length) return
    const timer = window.setTimeout(() => {
      setSelectedIndex(cursor)
      setCursor(value => value + 1)
      if (cursor + 1 >= targets.length) setPlaying(false)
    }, 360)
    return () => window.clearTimeout(timer)
  }, [cursor, playing, targets.length])

  const catches = targets.filter(target => target.complete).length
  const explosive = targets.filter(target => target.explosive).length
  const touchdowns = targets.filter(target => target.touchdown).length
  const averageDepth = targets.length ? targets.reduce((sum, item) => sum + item.airYards, 0) / targets.length : 0
  const play = () => { if (targets.length) { setSelectedIndex(0); setCursor(1); setPlaying(true) } }
  const step = (direction: number) => { setPlaying(false); setSelectedIndex(Math.max(0, Math.min(targets.length - 1, activeIndex + direction))) }
  const selectedOutcome = selectedTarget?.touchdown ? 'TOUCHDOWN' : selectedTarget?.complete ? `${selectedTarget.yards >= 0 ? '+' : ''}${selectedTarget.yards} YARDS` : 'INCOMPLETE'

  return <section className={styles.fullPanel}>
    <div className={styles.sectionHead}><div><span>PLAY-BY-PLAY FIELD POSITION</span><h2>Route Atlas</h2><p>Every target starts at its recorded line of scrimmage and ends at its recorded depth. Select any dot to inspect the real down, distance, first-down line and result.</p></div><Route size={24} /></div>
    <div className={styles.atlasToolbar}>
      <label><span>PLAYER</span><select value={player?.id ?? ''} onChange={event => { setPlayerId(event.target.value); setDefense('ALL'); setSelectedIndex(0); setPlaying(false) }}>{eligible.map(item => <option value={item.id} key={item.id}>{item.name} · {item.team}</option>)}</select></label>
      <label><span>DEFENSE</span><select value={defense} onChange={event => { setDefense(event.target.value); setSelectedIndex(0); setPlaying(false) }}><option value="ALL">All opponents</option>{defenses.map(item => <option value={item} key={item}>{item}</option>)}</select></label>
      <div className={styles.segmented}>{(['all', 'short', 'deep'] as const).map(item => <button key={item} type="button" className={depth === item ? styles.segmentActive : ''} onClick={() => { setDepth(item); setSelectedIndex(0); setPlaying(false) }}>{item.toUpperCase()}</button>)}</div>
      <div className={styles.atlasSteps}><button type="button" onClick={() => step(-1)} disabled={!activeIndex}>PREV</button><button type="button" onClick={() => step(1)} disabled={activeIndex >= targets.length - 1}>NEXT</button></div>
      <button type="button" className={styles.atlasPlay} onClick={() => playing ? setPlaying(false) : play()}>{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? 'Pause' : 'Replay plays'}</button>
    </div>
    {!player ? <EmptyState title="Target atlas is syncing" copy="The selected matchup has no recorded receiver targets in the loaded season." /> : <div className={styles.atlasGrid}>
      <div className={styles.atlasStadium}>
        <div className={styles.atlasScoreboard}><div>{fieldAway && <TeamLogo team={fieldAway} compact />}<span>{fieldAway?.abbr ?? selectedTarget?.awayTeam}</span></div><strong>{targetGame ? `${targetGame.season} · WEEK ${targetGame.week}` : `${lens.season} SEASON`}</strong><div><span>{fieldHome?.abbr ?? selectedTarget?.homeTeam}</span>{fieldHome && <TeamLogo team={fieldHome} compact />}</div></div>
        <div className={styles.atlasFieldRegulation}>
          <div className={styles.atlasEndzoneLeft} style={{ backgroundColor: fieldHome?.color ?? '#203d2b' }}>{fieldHome?.logo ? <Image src={fieldHome.logo} alt="" width={54} height={54} unoptimized /> : <b>{fieldHome?.abbr}</b>}<span>{fieldHome?.abbr}</span></div>
          <div className={styles.atlasEndzoneRight} style={{ backgroundColor: fieldHome?.color ?? '#203d2b' }}>{fieldHome?.logo ? <Image src={fieldHome.logo} alt="" width={54} height={54} unoptimized /> : <b>{fieldHome?.abbr}</b>}<span>{fieldHome?.abbr}</span></div>
          {fieldHome?.logo && <Image className={styles.atlasMidfieldLogo} src={fieldHome.logo} alt="" width={96} height={96} unoptimized />}
          {Array.from({ length: 21 }, (_, index) => 10 + index * 5).map(x => <div key={x} className={x % 10 === 0 ? styles.atlasMajorYardLine : styles.atlasMinorYardLine} style={{ left: `${x / 120 * 100}%` }}>{x > 10 && x < 110 && x % 10 === 0 && <><span>{x <= 60 ? x - 10 : 110 - x}</span><span>{x <= 60 ? x - 10 : 110 - x}</span></>}</div>)}
          {selectedTarget && selectedPoint && <><div className={styles.atlasFirstDown} style={{ left: `${lineToGain / 120 * 100}%` }}><b>{lineToGain === 110 ? 'GOAL' : '1ST'}</b></div><div className={styles.atlasSelectedLos} style={{ left: `${selectedPoint.los / 120 * 100}%` }}><b>LOS</b></div></>}
          <svg viewBox="0 0 120 53.3" preserveAspectRatio="none" aria-label={`${player.name} target atlas on a regulation football field`}>
            {visible.map(target => { const point = targetCoordinates(target); const active = target.id === selectedTarget?.id; return <circle key={target.id} cx={point.x} cy={point.y} r={active ? 1.35 : target.touchdown ? 1.05 : .72} className={`${target.touchdown ? styles.atlasTdDot : target.complete ? styles.atlasCatchDot : styles.atlasMissDot} ${active ? styles.atlasActiveDot : ''}`} onClick={() => { setPlaying(false); setSelectedIndex(targets.findIndex(item => item.id === target.id)) }} /> })}
            {selectedTarget && selectedPoint && <g className={styles.atlasSelectedRoute}><path d={`M ${selectedPoint.los} 26.65 Q ${(selectedPoint.los + selectedPoint.x) / 2} ${selectedPoint.y} ${selectedPoint.x} ${selectedPoint.y}`} className={styles.atlasAirTrace} />{selectedTarget.complete && Math.abs(resultX - selectedPoint.x) > .5 && <path d={`M ${selectedPoint.x} ${selectedPoint.y} L ${resultX} ${selectedPoint.y}`} className={styles.atlasYacTrace} />}<circle cx={resultX} cy={selectedPoint.y} r="1.15" className={selectedTarget.touchdown ? styles.atlasTdDot : selectedTarget.complete ? styles.atlasCatchDot : styles.atlasMissDot} /></g>}
          </svg>
          <div className={styles.atlasLaneLabels}><span>LEFT</span><span>MIDDLE</span><span>RIGHT</span></div>
          <div className={styles.atlasLegend}><span><i className={styles.legendCatch} /> Catch</span><span><i className={styles.legendMiss} /> Miss</span><span><i className={styles.legendTd} /> TD</span><strong>OFFENSE →</strong></div>
        </div>
      </div>
      <aside className={styles.atlasPanel}>
        <div className={styles.atlasPlayer}><PlayerAvatar src={player.headshot} name={player.name} size="large" /><div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><span>{targets.length} recorded targets</span></div></div>
        {selectedTarget && <div className={styles.atlasPlayCard}><div><span>Q{selectedTarget.quarter} · {selectedTarget.clock}</span><b>{ordinal(selectedTarget.down)} &amp; {selectedTarget.distance}</b></div><strong>{selectedOutcome}</strong><small>BALL ON {fieldPosition(selectedTarget)}</small><p>{selectedTarget.description || `${selectedTarget.team} target vs ${selectedTarget.defense}`}</p><div><span><b>{selectedTarget.airYards >= 0 ? '+' : ''}{selectedTarget.airYards}</b>AIR YDS</span><span><b>{selectedTarget.yards >= 0 ? '+' : ''}{selectedTarget.yards}</b>GAIN</span><span><b>{selectedTarget.yac >= 0 ? '+' : ''}{selectedTarget.yac}</b>YAC</span><span><b>{activeIndex + 1}/{targets.length}</b>PLAY</span></div></div>}
        <div className={styles.atlasStats}><div><b>{targets.length}</b><span>Targets</span></div><div><b>{targets.length ? Math.round(catches / targets.length * 100) : 0}%</b><span>Catch rate</span></div><div><b>{averageDepth.toFixed(1)}</b><span>aDOT</span></div><div><b>{explosive}</b><span>Explosive</span></div><div><b>{touchdowns}</b><span>TDs</span></div><div><b>{defenses.length}</b><span>Defenses</span></div></div>
        <div className={styles.atlasTruth}><Database size={17} /><span>Field position, down, distance, target depth and result come from recorded play-by-play. Left/middle/right is the recorded pass lane.</span></div>
      </aside>
    </div>}
  </section>
}

function routeCoordinates(target: SidelineTarget, index: number) {
  const lane = target.side === 'left' ? 24 : target.side === 'right' ? 76 : 50
  const jitter = ((index * 17 + target.playerName.length * 7) % 13) - 6
  return { x: Math.max(8, Math.min(92, lane + jitter)), y: Math.max(7, Math.min(55, 52 - target.airYards * .82)) }
}

export function RouteAtlas({ lens }: { lens: SidelineLens }) {
  const eligible = useMemo(() => lens.players.filter(player => lens.targets.some(target => target.playerId === player.id)), [lens.players, lens.targets])
  const [playerId, setPlayerId] = useState(eligible[0]?.id ?? '')
  const [defense, setDefense] = useState('ALL')
  const [depth, setDepth] = useState<'all' | 'short' | 'deep'>('all')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(999)
  const player = eligible.find(item => item.id === playerId) ?? eligible[0]
  const targets = useMemo(() => lens.targets.filter(target => target.playerId === player?.id && (defense === 'ALL' || target.defense === defense) && (depth === 'all' || (depth === 'deep' ? target.airYards >= 15 : target.airYards < 15))).slice(-90), [defense, depth, lens.targets, player?.id])
  const visible = targets.slice(0, Math.min(cursor, targets.length))
  const defenses = useMemo(() => Array.from(new Set(lens.targets.filter(target => target.playerId === player?.id).map(target => target.defense))).sort(), [lens.targets, player?.id])

  useEffect(() => {
    if (!playing || cursor >= targets.length) return
    const timer = window.setTimeout(() => {
      const next = cursor + 1
      setCursor(next)
      if (next >= targets.length) setPlaying(false)
    }, 130)
    return () => window.clearTimeout(timer)
  }, [cursor, playing, targets.length])

  const catches = targets.filter(target => target.complete).length
  const explosive = targets.filter(target => target.explosive).length
  const touchdowns = targets.filter(target => target.touchdown).length
  const averageDepth = targets.length ? targets.reduce((sum, item) => sum + item.airYards, 0) / targets.length : 0
  const play = () => { if (targets.length) { setCursor(0); setPlaying(true) } }

  return <section className={styles.fullPanel}>
    <div className={styles.sectionHead}><div><span>NFL TARGET SPRAY CHART</span><h2>Route Atlas</h2><p>Every recorded target aligned to one field. Filled dot = catch, ring = miss, gold = touchdown. Filter the receiver, opponent and depth, then replay the full target history.</p></div><Route size={24} /></div>
    <div className={styles.atlasToolbar}><label><span>PLAYER</span><select value={player?.id ?? ''} onChange={event => { setPlayerId(event.target.value); setDefense('ALL'); setCursor(999); setPlaying(false) }}>{eligible.map(item => <option value={item.id} key={item.id}>{item.name} · {item.team}</option>)}</select></label><label><span>DEFENSE</span><select value={defense} onChange={event => { setDefense(event.target.value); setCursor(999) }}><option value="ALL">All opponents</option>{defenses.map(item => <option value={item} key={item}>{item}</option>)}</select></label><div className={styles.segmented}>{(['all', 'short', 'deep'] as const).map(item => <button key={item} type="button" className={depth === item ? styles.segmentActive : ''} onClick={() => { setDepth(item); setCursor(999) }}>{item.toUpperCase()}</button>)}</div><button type="button" className={styles.atlasPlay} onClick={() => playing ? setPlaying(false) : play()}>{playing ? <Pause size={17} /> : <Play size={17} />}{playing ? 'Pause' : 'Replay targets'}</button></div>
    {!player ? <EmptyState title="Target atlas is syncing" copy="The selected matchup has no recorded receiver targets in the loaded season." /> : <div className={styles.atlasGrid}>
      <div className={styles.atlasField}><div className={styles.atlasEndzone}>END ZONE</div>{[10, 20, 30, 40].map(value => <span className={styles.atlasYard} style={{ bottom: `${value * 1.72 + 10}%` }} key={value}>{value}</span>)}<svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-label={`${player.name} target atlas`}>{visible.map((target, index) => { const point = routeCoordinates(target, index); const curve = point.x < 50 ? point.x + 10 : point.x - 10; return <g key={target.id} className={styles.atlasRoute} style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}><path d={`M 50 55 Q ${curve} 35 ${point.x} ${point.y}`} className={target.complete ? styles.atlasCatchPath : styles.atlasMissPath} /><circle cx={point.x} cy={point.y} r={target.touchdown ? 1.75 : 1.25} className={target.touchdown ? styles.atlasTdDot : target.complete ? styles.atlasCatchDot : styles.atlasMissDot} /></g>})}</svg><div className={styles.atlasLos}>LINE OF SCRIMMAGE</div><div className={styles.atlasLegend}><span><i className={styles.legendCatch} /> Catch</span><span><i className={styles.legendMiss} /> Miss</span><span><i className={styles.legendTd} /> TD</span></div></div>
      <aside className={styles.atlasPanel}><div className={styles.atlasPlayer}><PlayerAvatar src={player.headshot} name={player.name} size="large" /><div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><span>{targets.length} recorded targets</span></div></div><div className={styles.atlasStats}><div><b>{targets.length}</b><span>Targets</span></div><div><b>{targets.length ? Math.round(catches / targets.length * 100) : 0}%</b><span>Catch rate</span></div><div><b>{averageDepth.toFixed(1)}</b><span>aDOT</span></div><div><b>{explosive}</b><span>Explosive</span></div><div><b>{touchdowns}</b><span>TDs</span></div><div><b>{defenses.length}</b><span>Defenses</span></div></div><div className={styles.atlasRead}><small>WHAT THIS CHANGES</small><strong>{(player.projections.find(item => item.key === 'receiving-yards')?.matchup ?? 0) >= 0 ? 'The opponent expands this receiving lane.' : 'The opponent compresses this receiving lane.'}</strong><p>Use the atlas to see whether volume is arriving short, deep or outside—and whether the defense normally allows the same stat family.</p></div><div className={styles.atlasTruth}><Database size={17} /><span>These are recorded target directions, depths and outcomes. Exact GPS route shapes require licensed tracking coordinates and are never fabricated here.</span></div></aside>
    </div>}
  </section>
}

function RedZoneView({ lens }: { lens: SidelineLens }) {
  const players = [...lens.players].sort((a, b) => b.redZone - a.redZone)
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>INSIDE THE 20</span><h2>Red-zone command</h2><p>Opportunity and scoring-role hierarchy from recorded plays.</p></div><Goal size={22} /></div><div className={styles.redZoneGrid}><div className={styles.redZoneVisual}><strong>END ZONE</strong>{[20, 15, 10, 5].map(value => <span key={value}>{value}</span>)}<div className={styles.redZoneTarget}><Crosshair size={34} /><b>{players[0]?.team ?? 'NFL'}</b><small>TOP SCORING LANE</small></div></div><div className={styles.redZoneList}>{players.slice(0, 8).map((player, index) => <article key={player.id}><span>{index + 1}</span><PlayerAvatar src={player.headshot} name={player.name} size="small" /><div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><em>{player.redZoneLooks} recorded looks</em></div><b className={numberTone(player.redZone)}>{player.redZone}</b></article>)}</div></div></section>
}

export function SidelineClient({ games, selectedId, lens }: { games: SidelineGame[]; selectedId: string; lens: SidelineLens }) {
  const router = useRouter()
  const [view, setView] = useState<View>('props')
  const [isPending, startTransition] = useTransition()
  const selected = games.find(game => game.id === selectedId) ?? games[0]
  if (!selected) return null
  const date = new Date(`${selected.gameday}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const selectGame = (game: SidelineGame) => startTransition(() => router.replace(`/the-sideline?game=${encodeURIComponent(game.id)}`, { scroll: false }))

  return (
    <main className={`${styles.page} ${isPending ? styles.loading : ''}`}>
      <header className={styles.header}><div className={styles.brandMark}><span>50</span></div><div><div className={styles.eyebrow}>NFL MATCHUP INTELLIGENCE</div><h1>The Sideline <span>PRIVATE</span></h1><p>Projected volume, route geometry, opponent allowances and historical play evidence.</p></div><div className={styles.privateBadge}><Radio size={13} /> Internal build</div></header>
      <div className={styles.gameRail} aria-label="Choose an NFL game">{games.slice(0, 16).map(game => <button key={game.id} type="button" aria-label={`${game.away.name} at ${game.home.name}`} className={game.id === selected.id ? styles.gameActive : styles.gameButton} onClick={() => selectGame(game)}><div className={styles.railLogos}><TeamLogo team={game.away} compact /><b>VS</b><TeamLogo team={game.home} compact /></div><span>{game.away.abbr} @ {game.home.abbr}</span><small>{new Date(`${game.gameday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · W{game.week}</small></button>)}</div>
      <section className={styles.matchupBar}><div className={styles.teamBlock}><TeamLogo team={selected.away} /><div><small>AWAY</small><strong>{selected.away.name}</strong><span>{selected.away.abbr}</span></div></div><div className={styles.gameMeta}><span>{selected.gameType} · WEEK {selected.week}</span><strong>{selected.gametime ?? 'TBD'}</strong><small>{date} · {selected.stadium ?? 'Stadium TBD'}</small></div><div className={`${styles.teamBlock} ${styles.teamBlockHome}`}><div><small>HOME</small><strong>{selected.home.name}</strong><span>{selected.home.abbr}</span></div><TeamLogo team={selected.home} /></div></section>
      <div className={styles.statusStrip}><span><Wind size={14} /> {selected.roof ?? 'Roof TBD'}</span><span><Shield size={14} /> {selected.surface ?? 'Surface TBD'}</span><span><Database size={14} /> {lens.historicalGames.length} archived games · plays load on demand</span><span className={styles.liveDot}>Private route · noindex</span></div>
      <nav className={styles.viewNav} aria-label="Sideline views">{views.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? styles.viewActive : ''} onClick={() => setView(item.id)}><Icon size={17} />{item.label}</button> })}</nav>
      <div className={styles.blueprintBanner}><div><small>THIS MATCHUP</small><strong>{lens.headline}</strong><span>{lens.headlineDetail}</span></div><b>{lens.players[0]?.index ?? '—'}<small><SlipSurgeScoreLabel prefix="Top" compact /></small></b><ChevronRight size={20} /></div>
      {view === 'props' && <PropCommand key={selected.id} lens={lens} />}{view === 'routes' && <RouteAtlasField key={selected.id} lens={lens} />}{view === 'film' && <FilmRoom key={selected.id} lens={lens} />}{view === 'team-dna' && <TeamDnaView lens={lens} />}{view === 'red-zone' && <RedZoneView lens={lens} />}
    </main>
  )
}
