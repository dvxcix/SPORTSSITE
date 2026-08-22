'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowUpRight,
  ChartNoAxesCombined,
  Crosshair,
  Gauge,
  Goal,
  Layers3,
  Radio,
  Route,
  Shield,
  Sparkles,
  Target,
  Wind,
} from 'lucide-react'
import styles from './sideline.module.css'

type Team = { abbr: string; name: string; color: string; logo: string | null }

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
}

type View = 'blueprint' | 'field' | 'red-zone' | 'matchups' | 'props'

const views: { id: View; label: string; icon: typeof Layers3 }[] = [
  { id: 'blueprint', label: 'Blueprint', icon: Layers3 },
  { id: 'field', label: 'Field', icon: Route },
  { id: 'red-zone', label: 'Red Zone', icon: Goal },
  { id: 'matchups', label: 'Matchups', icon: Crosshair },
  { id: 'props', label: 'Props', icon: Target },
]

function TeamLogo({ team }: { team: Team }) {
  if (team.logo) return <Image className={styles.teamLogo} src={team.logo} alt="" width={48} height={48} unoptimized />
  return <span className={styles.teamFallback} style={{ background: team.color }}>{team.abbr.slice(0, 2)}</span>
}

function numberTone(value: number) {
  if (value >= 72) return styles.scoreStrong
  if (value >= 55) return styles.scoreWatch
  return styles.scoreQuiet
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.scoreBar}>
      <span>{label}</span>
      <i><b style={{ width: `${Math.max(4, value)}%` }} /></i>
      <strong className={numberTone(value)}>{value}</strong>
    </div>
  )
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <Radio size={20} />
      <strong>Historical layer is syncing</strong>
      <span>The live matchup shell is ready. Player lanes populate when the NFL tables finish loading.</span>
    </div>
  )
}

function FootballField({ aggressor }: { aggressor: string }) {
  return (
    <div className={styles.field}>
      {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((yard, index) => (
        <div className={styles.yardLine} style={{ left: `${10 + index * 10}%` }} key={`${yard}-${index}`}><span>{yard}</span></div>
      ))}
      <div className={styles.lineOfScrimmage} />
      <div className={`${styles.routeLine} ${styles.routeOne}`} />
      <div className={`${styles.routeLine} ${styles.routeTwo}`} />
      <div className={`${styles.routeLine} ${styles.routeThree}`} />
      <div className={styles.qb}>QB</div>
      {['X', 'LT', 'LG', 'C', 'RG', 'RT', 'Y', 'Z'].map((player, index) => (
        <div key={player} className={styles.offense} style={{ left: `${22 + index * 7.8}%`, top: index === 0 ? '76%' : index === 7 ? '70%' : '60%' }}>{player}</div>
      ))}
      {[18, 28, 38, 48, 58, 68, 78, 25, 42, 62, 79].map((left, index) => (
        <div key={index} className={styles.defense} style={{ left: `${left}%`, top: index < 7 ? '43%' : '23%' }} />
      ))}
      <div className={styles.fieldCallout}><Crosshair size={14} /><div><b>{aggressor} leverage</b><span>Primary stress lane</span></div></div>
    </div>
  )
}

function TeamTendency({ profile }: { profile: SidelineTeamProfile }) {
  return (
    <article className={styles.tendencyCard}>
      <div className={styles.tendencyTeam}><TeamLogo team={profile.team} /><div><small>OFFENSIVE SHAPE</small><strong>{profile.team.abbr}</strong></div></div>
      <div className={styles.tendencyHero}><b>{profile.neutralPassRate.toFixed(1)}%</b><span>neutral pass</span></div>
      <div className={styles.miniStats}>
        <span><b>{profile.shotgunRate.toFixed(1)}%</b>Shotgun</span>
        <span><b>{profile.explosiveRate.toFixed(1)}%</b>Explosive</span>
        <span><b>{profile.redZoneTdRate.toFixed(1)}%</b>RZ score</span>
      </div>
    </article>
  )
}

function BlueprintView({ lens }: { lens: SidelineLens }) {
  const lead = lens.players[0]
  return (
    <div className={styles.workspace}>
      <div className={styles.fieldPanel}>
        <div className={styles.panelHead}>
          <div><span>GAME BLUEPRINT</span><h2>{lens.headline}</h2></div>
          <div className={styles.dataStamp}>{lens.season} sample · {lens.plays.toLocaleString()} plays</div>
        </div>
        <p className={styles.headlineDetail}>{lens.headlineDetail}</p>
        <FootballField aggressor={lens.aggressor} />
        <div className={styles.playFooter}>
          <span><i className={styles.limeDot} /> First-read window</span>
          <span><i className={styles.blueDot} /> Coverage leverage</span>
          <span><i className={styles.redDot} /> Pressure entry</span>
          <strong>Live concept layer</strong>
        </div>
        <div className={styles.tendencyGrid}>{lens.teams.map(profile => <TeamTendency key={profile.team.abbr} profile={profile} />)}</div>
      </div>

      <aside className={styles.blueprintPanel}>
        <div className={styles.panelHead}><div><span>SIDELINE INDEX</span><h2>Best structural lane</h2></div><ChartNoAxesCombined size={18} /></div>
        {lead ? (
          <>
            <div className={styles.primaryRead}>
              <small>{lead.team} · {lead.position} · {lead.lane}</small>
              <strong>{lead.name}</strong>
              <p>Usage, field geometry and scoring role condensed into one matchup read.</p>
              <div><b>{lead.index}</b><span>SIDELINE<br />INDEX</span></div>
            </div>
            <div className={styles.indexList}>
              <ScoreBar label="Volume" value={lead.volume} />
              <ScoreBar label="Geometry" value={lead.geometry} />
              <ScoreBar label="Red zone" value={lead.redZone} />
              <ScoreBar label="Breakaway" value={lead.breakaway} />
              <ScoreBar label="Evidence" value={lead.evidence} />
            </div>
          </>
        ) : <EmptyState />}
        <div className={styles.integrityNote}><Shield size={14} /><span><b>Read, then price</b>Structure is separated from the market layer.</span></div>
      </aside>
    </div>
  )
}

function FieldView({ lens }: { lens: SidelineLens }) {
  return (
    <div className={styles.fullPanel}>
      <div className={styles.panelHead}><div><span>FIELD GEOMETRY</span><h2>Where the matchup bends</h2></div><Route size={19} /></div>
      <div className={styles.fieldSplit}>
        <FootballField aggressor={lens.aggressor} />
        <div className={styles.fieldReads}>
          {lens.players.slice(0, 5).map((player, index) => (
            <article key={player.id}>
              <span className={styles.rank}>0{index + 1}</span>
              <div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><p>{player.lane}</p></div>
              <b className={numberTone(player.geometry)}>{player.geometry}</b>
            </article>
          ))}
          {!lens.players.length && <EmptyState />}
        </div>
      </div>
      <div className={styles.contextGrid}>
        <div><small>EARLY DOWN</small><b>{lens.teams[0]?.neutralPassRate.toFixed(1)} / {lens.teams[1]?.neutralPassRate.toFixed(1)}</b><span>neutral pass rates</span></div>
        <div><small>SPACE CREATION</small><b>{lens.players[0]?.separation.toFixed(1) ?? '—'}</b><span>top avg separation</span></div>
        <div><small>VERTICAL INTENT</small><b>{lens.players[0]?.airYards.toFixed(1) ?? '—'}</b><span>top lane aDOT</span></div>
        <div><small>EXPLOSIVE STRESS</small><b>{Math.max(...lens.teams.map(team => team.defenseExplosiveAllowed), 0).toFixed(1)}%</b><span>defensive allowance</span></div>
      </div>
    </div>
  )
}

function RedZoneView({ lens }: { lens: SidelineLens }) {
  const players = [...lens.players].sort((a, b) => b.redZone - a.redZone)
  return (
    <div className={styles.fullPanel}>
      <div className={styles.panelHead}><div><span>RED-ZONE COMMAND</span><h2>Compressed-field hierarchy</h2></div><Goal size={19} /></div>
      <div className={styles.redZoneLayout}>
        <div className={styles.redZoneField}><span>20</span><span>10</span><strong>END ZONE</strong><i /><i /><i /></div>
        <div className={styles.opportunityList}>
          {players.slice(0, 7).map((player, index) => (
            <article key={player.id}>
              <span>{index + 1}</span>
              <div><small>{player.team} · {player.position}</small><strong>{player.name}</strong><p>{player.redZoneLooks} tracked looks</p></div>
              <b className={numberTone(player.redZone)}>{player.redZone}</b>
            </article>
          ))}
          {!players.length && <EmptyState />}
        </div>
      </div>
    </div>
  )
}

function MatchupsView({ lens }: { lens: SidelineLens }) {
  return (
    <div className={styles.fullPanel}>
      <div className={styles.panelHead}><div><span>PLAYER MATRIX</span><h2>Every lane, one grid</h2></div><Crosshair size={19} /></div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead><tr><th>Player</th><th>Lane</th><th>Vol</th><th>Geo</th><th>RZ</th><th>Burst</th><th>Proof</th><th>Index</th></tr></thead>
          <tbody>{lens.players.map(player => (
            <tr key={player.id}>
              <td><small>{player.team} · {player.position}</small><strong>{player.name}</strong></td>
              <td>{player.lane}</td>
              {[player.volume, player.geometry, player.redZone, player.breakaway, player.evidence].map((value, index) => <td key={index}><span className={numberTone(value)}>{value}</span></td>)}
              <td><b className={numberTone(player.index)}>{player.index}</b></td>
            </tr>
          ))}</tbody>
        </table>
        {!lens.players.length && <EmptyState />}
      </div>
    </div>
  )
}

function PropsView({ lens }: { lens: SidelineLens }) {
  const lanes = [
    { title: 'Reception volume', key: 'volume' as const, icon: Activity },
    { title: 'Yardage geometry', key: 'geometry' as const, icon: Route },
    { title: 'Scoring role', key: 'redZone' as const, icon: Goal },
    { title: 'Explosive outcome', key: 'breakaway' as const, icon: Sparkles },
  ]
  return (
    <div className={styles.fullPanel}>
      <div className={styles.panelHead}><div><span>PROP WORKBENCH</span><h2>Structure before price</h2></div><Target size={19} /></div>
      <div className={styles.propGrid}>
        {lanes.map(lane => {
          const player = [...lens.players].sort((a, b) => b[lane.key] - a[lane.key])[0]
          const Icon = lane.icon
          return (
            <article key={lane.key}>
              <div className={styles.propIcon}><Icon size={18} /></div>
              <small>{lane.title}</small>
              {player ? <><strong>{player.name}</strong><span>{player.team} · {player.position} · {player.lane}</span><div><b className={numberTone(player[lane.key])}>{player[lane.key]}</b><ArrowUpRight size={16} /></div></> : <p>Awaiting player data</p>}
            </article>
          )
        })}
      </div>
      <div className={styles.marketPlaceholder}><Gauge size={18} /><div><strong>Market overlay ready</strong><span>Prop prices, movement and liability signals plug into these lanes without changing the football read.</span></div></div>
    </div>
  )
}

export function SidelineClient({ games, selectedId, lens }: { games: SidelineGame[]; selectedId: string; lens: SidelineLens }) {
  const router = useRouter()
  const [view, setView] = useState<View>('blueprint')
  const [isPending, startTransition] = useTransition()
  const selected = games.find(game => game.id === selectedId) ?? games[0]
  if (!selected) return null

  const date = new Date(`${selected.gameday}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const selectGame = (game: SidelineGame) => startTransition(() => router.replace(`/the-sideline?game=${encodeURIComponent(game.id)}`, { scroll: false }))

  return (
    <div className={`${styles.page} ${isPending ? styles.loading : ''}`}>
      <header className={styles.header}>
        <div className={styles.brandMark}><span>50</span></div>
        <div><div className={styles.eyebrow}>NFL INTELLIGENCE</div><h1>The Sideline <span>LAB</span></h1><p>Game script, field geometry, matchup structure.</p></div>
        <div className={styles.privateBadge}><Radio size={12} /> Private preseason build</div>
      </header>

      <div className={styles.gameRail} aria-label="Choose an NFL game">
        {games.slice(0, 16).map(game => (
          <button key={game.id} type="button" className={game.id === selected.id ? styles.gameActive : styles.gameButton} onClick={() => selectGame(game)}>
            <span>{game.away.abbr}</span><b>@</b><span>{game.home.abbr}</span>
            <small>{new Date(`${game.gameday}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>
          </button>
        ))}
      </div>

      <section className={styles.matchupBar}>
        <div className={styles.teamBlock}><TeamLogo team={selected.away} /><div><small>AWAY</small><strong>{selected.away.name}</strong><span>{selected.away.abbr}</span></div></div>
        <div className={styles.gameMeta}><span>{selected.gameType} · WEEK {selected.week}</span><strong>{selected.gametime ?? 'TBD'}</strong><small>{date} · {selected.stadium ?? 'Stadium TBD'}</small></div>
        <div className={`${styles.teamBlock} ${styles.teamBlockHome}`}><div><small>HOME</small><strong>{selected.home.name}</strong><span>{selected.home.abbr}</span></div><TeamLogo team={selected.home} /></div>
      </section>

      <div className={styles.statusStrip}>
        <span><Wind size={13} /> {selected.roof ?? 'Roof TBD'}</span>
        <span><Shield size={13} /> {selected.surface ?? 'Surface TBD'}</span>
        <span><Activity size={13} /> {lens.status === 'calculated' ? `${lens.season} model loaded` : 'Data sync pending'}</span>
        <span className={styles.liveDot}>Private route · noindex</span>
      </div>

      <nav className={styles.viewNav} aria-label="Sideline views">
        {views.map(item => {
          const Icon = item.icon
          return <button key={item.id} type="button" className={view === item.id ? styles.viewActive : ''} onClick={() => setView(item.id)}><Icon size={15} />{item.label}</button>
        })}
      </nav>

      {view === 'blueprint' && <BlueprintView lens={lens} />}
      {view === 'field' && <FieldView lens={lens} />}
      {view === 'red-zone' && <RedZoneView lens={lens} />}
      {view === 'matchups' && <MatchupsView lens={lens} />}
      {view === 'props' && <PropsView lens={lens} />}
    </div>
  )
}
