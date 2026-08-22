'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity, ArrowUpRight, BarChart3, ChevronRight, CircleDot, Crosshair,
  Database, Film, Gauge, Goal, LoaderCircle, Radio, Route, Search, Shield, Sparkles, Target, Users, Wind,
} from 'lucide-react'
import styles from './sideline.module.css'

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
}

type View = 'film' | 'team-dna' | 'players' | 'red-zone' | 'markets'

const views: { id: View; label: string; icon: typeof Film }[] = [
  { id: 'film', label: 'Historic Matchup', icon: Film },
  { id: 'team-dna', label: 'Team DNA', icon: BarChart3 },
  { id: 'players', label: 'Player Lab', icon: Users },
  { id: 'red-zone', label: 'Red Zone', icon: Goal },
  { id: 'markets', label: 'Markets', icon: Target },
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

function ScoreBar({ label, value }: { label: string; value: number }) {
  return <div className={styles.scoreBar}><span>{label}</span><i><b style={{ width: `${Math.max(4, value)}%` }} /></i><strong className={numberTone(value)}>{value}</strong></div>
}

function TeamDnaView({ lens }: { lens: SidelineLens }) {
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>{lens.season} SEASON SAMPLE</span><h2>Team DNA</h2><p>Play-level tendencies from the current matchup teams.</p></div><Activity size={22} /></div><div className={styles.dnaGrid}>{lens.teams.map(profile => <article className={styles.dnaCard} key={profile.team.abbr}><div className={styles.dnaTeam}><TeamLogo team={profile.team} /><div><small>{profile.plays.toLocaleString()} PLAYS</small><strong>{profile.team.name}</strong><span>{profile.team.abbr}</span></div></div><div className={styles.dnaHero}><small>NEUTRAL-DOWN PASS RATE</small><b>{profile.neutralPassRate.toFixed(1)}%</b></div><div className={styles.dnaStats}><div><b>{profile.shotgunRate.toFixed(1)}%</b><span>Shotgun</span></div><div><b>{profile.successRate.toFixed(1)}%</b><span>Success</span></div><div><b>{profile.explosiveRate.toFixed(1)}%</b><span>Explosive</span></div><div><b>{profile.redZoneTdRate.toFixed(1)}%</b><span>RZ TD</span></div><div><b>{profile.thirdDownRate.toFixed(1)}%</b><span>3rd down</span></div><div><b>{profile.defenseExplosiveAllowed.toFixed(1)}%</b><span>Explosive allowed</span></div></div></article>)}</div></section>
}

function PlayerLab({ lens }: { lens: SidelineLens }) {
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>NGS + PLAY-BY-PLAY</span><h2>Player Lab</h2><p>Real usage, geometry and scoring-role profiles with player identity attached.</p></div><Users size={22} /></div><div className={styles.playerGrid}>{lens.players.map((player, index) => <article className={styles.playerCard} key={player.id}><div className={styles.playerCardTop}><span className={styles.playerRank}>#{index + 1}</span><PlayerAvatar src={player.headshot} name={player.name} /><div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><span>{player.lane}</span></div><b className={numberTone(player.index)}>{player.index}</b></div><div className={styles.playerBars}><ScoreBar label="Volume" value={player.volume} /><ScoreBar label="Geometry" value={player.geometry} /><ScoreBar label="Red zone" value={player.redZone} /><ScoreBar label="Breakaway" value={player.breakaway} /></div><div className={styles.playerFacts}><span><b>{player.targets}</b> targets</span><span><b>{player.carries}</b> carries</span><span><b>{player.airYards.toFixed(1)}</b> aDOT</span><span><b>{player.separation.toFixed(1)}</b> separation</span></div></article>)}</div>{!lens.players.length && <EmptyState />}</section>
}

function RedZoneView({ lens }: { lens: SidelineLens }) {
  const players = [...lens.players].sort((a, b) => b.redZone - a.redZone)
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>INSIDE THE 20</span><h2>Red-zone command</h2><p>Opportunity and scoring-role hierarchy from recorded plays.</p></div><Goal size={22} /></div><div className={styles.redZoneGrid}><div className={styles.redZoneVisual}><strong>END ZONE</strong>{[20, 15, 10, 5].map(value => <span key={value}>{value}</span>)}<div className={styles.redZoneTarget}><Crosshair size={34} /><b>{players[0]?.team ?? 'NFL'}</b><small>TOP SCORING LANE</small></div></div><div className={styles.redZoneList}>{players.slice(0, 8).map((player, index) => <article key={player.id}><span>{index + 1}</span><PlayerAvatar src={player.headshot} name={player.name} size="small" /><div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><em>{player.redZoneLooks} recorded looks</em></div><b className={numberTone(player.redZone)}>{player.redZone}</b></article>)}</div></div></section>
}

function MarketsView({ lens }: { lens: SidelineLens }) {
  const lanes = [{ title: 'Reception volume', key: 'volume' as const, icon: Activity, copy: 'Targets, share and role stability' }, { title: 'Yardage geometry', key: 'geometry' as const, icon: Route, copy: 'aDOT, separation and field access' }, { title: 'Scoring role', key: 'redZone' as const, icon: Goal, copy: 'Recorded opportunities inside the 20' }, { title: 'Explosive outcome', key: 'breakaway' as const, icon: Sparkles, copy: 'Breakaway and YAC environment' }]
  return <section className={styles.fullPanel}><div className={styles.sectionHead}><div><span>FOOTBALL FIRST</span><h2>Market workbench</h2><p>Structural leaders ready for price and movement overlays.</p></div><Gauge size={22} /></div><div className={styles.marketGrid}>{lanes.map(lane => { const player = [...lens.players].sort((a, b) => b[lane.key] - a[lane.key])[0]; const Icon = lane.icon; return <article key={lane.key}><div className={styles.marketIcon}><Icon size={20} /></div><small>{lane.title}</small>{player ? <><div className={styles.marketPlayer}><PlayerAvatar src={player.headshot} name={player.name} size="small" /><div><strong>{player.name}</strong><span>{player.team} · {player.position}</span></div></div><p>{lane.copy}</p><div className={styles.marketScore}><b className={numberTone(player[lane.key])}>{player[lane.key]}</b><ArrowUpRight size={17} /></div></> : <p>Awaiting player data</p>}</article> })}</div><div className={styles.marketNotice}><CircleDot size={18} /><div><strong>Live NFL prices are the next feed—not fabricated placeholders.</strong><span>The workbench currently shows the football side only. It will label price, movement and book agreement separately when those NFL markets are connected.</span></div></div></section>
}

export function SidelineClient({ games, selectedId, lens }: { games: SidelineGame[]; selectedId: string; lens: SidelineLens }) {
  const router = useRouter()
  const [view, setView] = useState<View>('film')
  const [isPending, startTransition] = useTransition()
  const selected = games.find(game => game.id === selectedId) ?? games[0]
  if (!selected) return null
  const date = new Date(`${selected.gameday}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const selectGame = (game: SidelineGame) => startTransition(() => router.replace(`/the-sideline?game=${encodeURIComponent(game.id)}`, { scroll: false }))

  return (
    <main className={`${styles.page} ${isPending ? styles.loading : ''}`}>
      <header className={styles.header}><div className={styles.brandMark}><span>50</span></div><div><div className={styles.eyebrow}>NFL RESEARCH SUITE</div><h1>The Sideline <span>PRIVATE</span></h1><p>Historical film, team identity, player geometry and market structure.</p></div><div className={styles.privateBadge}><Radio size={13} /> Internal build</div></header>
      <div className={styles.gameRail} aria-label="Choose an NFL game">{games.slice(0, 16).map(game => <button key={game.id} type="button" aria-label={`${game.away.name} at ${game.home.name}`} className={game.id === selected.id ? styles.gameActive : styles.gameButton} onClick={() => selectGame(game)}><div className={styles.railLogos}><TeamLogo team={game.away} compact /><b>VS</b><TeamLogo team={game.home} compact /></div><span>{game.away.abbr} @ {game.home.abbr}</span><small>{new Date(`${game.gameday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · W{game.week}</small></button>)}</div>
      <section className={styles.matchupBar}><div className={styles.teamBlock}><TeamLogo team={selected.away} /><div><small>AWAY</small><strong>{selected.away.name}</strong><span>{selected.away.abbr}</span></div></div><div className={styles.gameMeta}><span>{selected.gameType} · WEEK {selected.week}</span><strong>{selected.gametime ?? 'TBD'}</strong><small>{date} · {selected.stadium ?? 'Stadium TBD'}</small></div><div className={`${styles.teamBlock} ${styles.teamBlockHome}`}><div><small>HOME</small><strong>{selected.home.name}</strong><span>{selected.home.abbr}</span></div><TeamLogo team={selected.home} /></div></section>
      <div className={styles.statusStrip}><span><Wind size={14} /> {selected.roof ?? 'Roof TBD'}</span><span><Shield size={14} /> {selected.surface ?? 'Surface TBD'}</span><span><Database size={14} /> {lens.historicalGames.length} archived games · plays load on demand</span><span className={styles.liveDot}>Private route · noindex</span></div>
      <nav className={styles.viewNav} aria-label="Sideline views">{views.map(item => { const Icon = item.icon; return <button key={item.id} type="button" className={view === item.id ? styles.viewActive : ''} onClick={() => setView(item.id)}><Icon size={17} />{item.label}</button> })}</nav>
      <div className={styles.blueprintBanner}><div><small>THIS MATCHUP</small><strong>{lens.headline}</strong><span>{lens.headlineDetail}</span></div><b>{lens.players[0]?.index ?? '—'}<small>TOP INDEX</small></b><ChevronRight size={20} /></div>
      {view === 'film' && <FilmRoom key={selected.id} lens={lens} />}{view === 'team-dna' && <TeamDnaView lens={lens} />}{view === 'players' && <PlayerLab lens={lens} />}{view === 'red-zone' && <RedZoneView lens={lens} />}{view === 'markets' && <MarketsView lens={lens} />}
    </main>
  )
}
