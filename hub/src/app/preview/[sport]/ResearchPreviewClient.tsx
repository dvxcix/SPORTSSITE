'use client'

import { useId, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Check, ChevronRight, Clock3, Layers3, LockKeyhole, Minus, ShieldCheck, X } from 'lucide-react'
import { ModalSurface } from '@/components/ui/ModalSurface'
import { useAuth } from '@/context/AuthContext'
import { hasNbaAccess } from '@/lib/nbaAccessPolicy'
import { nflOddsBoardMove } from '@/lib/nflOddsBoard'
import { trackProductEvent } from '@/lib/productAnalytics'
import { sportTeamBackground, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { PREVIEW_CONFIG, previewPagePath, previewPricingPath, previewWorkspacePath, type PreviewContext, type PreviewGame, type PreviewPrice, type PreviewSport, type ResearchPreview } from '@/lib/publicResearchPreview'
import styles from './preview.module.css'

type Unlock = { title: string; body: string; feature: string }
const slateUnlock: Unlock = { title: 'Research the full slate', body: 'Compare every matchup side by side, switch sportsbooks, and see the same saved pregame numbers after the game starts.', feature: 'full_slate' }
const tools: Record<PreviewSport, Unlock[]> = {
  nba: [
    { title: 'More markets', body: 'Switch from points to rebounds, assists, threes, and the other supported markets in The Court.', feature: 'markets' },
    { title: 'Projections and DvP', body: 'Check the season’s projections, player trends, and defense by position for the matchup you’re researching.', feature: 'research' },
    { title: 'Historical boards', body: 'Revisit saved pregame prices and compare them against actual results.', feature: 'history' },
  ],
  nfl: [
    { title: 'More markets', body: 'Switch from receiving yards to receptions, rushing, passing, and touchdown scorers in The Sideline.', feature: 'markets' },
    { title: 'Matchup Lab and The Public', body: 'Dig into matchup context, player usage, and the pick counts available for each game.', feature: 'research' },
    { title: 'Historical boards', body: 'Revisit saved pregame prices and compare them against actual results.', feature: 'history' },
  ],
}
const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
const day = (value: string) => dateLabel.format(new Date(value + 'T00:00:00Z'))
const priceText = (value: number) => value > 0 ? '+' + value : '−' + Math.abs(value)
const scoreReady = (game: PreviewGame) => game.awayScore !== null && game.homeScore !== null

function TeamMark({ sport, team, large = false }: { sport: PreviewSport; team: string; large?: boolean }) {
  const url = sportTeamLogoUrl(sport, team)
  return <span className={large ? styles.largeTeam : styles.teamMark} style={{ background: sportTeamBackground(sport, team) }}>
    {url ? <Image src={url} alt="" width={large ? 38 : 17} height={large ? 38 : 17} unoptimized /> : <span aria-hidden="true">{team}</span>}
  </span>
}

function GameMeta({ game }: { game: PreviewGame }) {
  if (game.state === 'final') return <>Final</>
  if (game.state === 'started') return <>Start time passed</>
  return <>{game.start ? timeLabel.format(new Date(game.start)) + ' ET' : 'Time TBD'}</>
}

function Movement({ quote }: { quote: PreviewPrice }) {
  const move = nflOddsBoardMove(quote.price, quote.opening)
  if (move == null) return <span className={styles.noMove}>Opening unavailable</span>
  if (move === 0) return <span className={styles.noMove}><Minus size={12} /> Unchanged</span>
  const up = move > 0, Icon = up ? ArrowUpRight : ArrowDownRight
  return <span className={up ? styles.shorter : styles.longer}><Icon size={14} /> {up ? '+' : '−'}{Math.abs(move) < .05 ? '<0.1' : Math.abs(move).toFixed(1)} pp <span>{up ? 'Shortened' : 'Lengthened'}</span></span>
}

export function ResearchPreviewClient({ sport, preview, initial }: { sport: PreviewSport; preview: ResearchPreview; initial: PreviewContext | null }) {
  const { user, profile } = useAuth()
  const config = PREVIEW_CONFIG[sport]
  const { board, schedule, date, scheduleAvailable } = preview
  const { game, players } = board
  const [playerId, setPlayer] = useState(initial?.player ?? players[0]?.id)
  const [line, setLine] = useState<number | null>(initial?.line ?? null)
  const [unlock, setUnlock] = useState<Unlock | null>(null)
  const tracked = useRef(new Set<string>())
  const dialogTitle = useId(), dialogDescription = useId()
  const paid = !!user && hasNbaAccess(profile)
  const selected = players.find(row => row.id === playerId) ?? players[0]
  const activeLine = line ?? selected?.prices.find(quote => quote.line === (sport === 'nba' ? 20 : 50))?.line ?? selected?.prices[0]?.line
  const selectedQuote = selected?.prices.find(quote => quote.line === activeLine)
  const context = { sport, game: game.id, date: game.date, player: selected?.id, line: activeLine }
  const workspace = previewWorkspacePath(context)
  const pricing = previewPricingPath(context)
  const signIn = '/auth/login?next=' + encodeURIComponent(previewPagePath(context))

  function explore(action: 'player' | 'rung') {
    if (!tracked.current.has(action)) {
      tracked.current.add(action)
      trackProductEvent('research_preview_explored', { sport, action, example: board.example })
    }
  }

  function openUpgrade(feature: Unlock) {
    setUnlock(feature)
    trackProductEvent('research_preview_locked_opened', { sport, feature: feature.feature })
  }

  function lockedLink(feature: Unlock, href: string, content: React.ReactNode, className: string) {
    return paid ? <Link className={className} href={href}>{content}<ChevronRight size={15} /></Link>
      : <button type="button" className={className} aria-haspopup="dialog" onClick={() => openUpgrade(feature)}>{content}<LockKeyhole size={14} /></button>
  }

  return <div className={styles.page}>
    <header className={styles.top}>
      <Link href="/" className={styles.brand} aria-label="SlipSurge home"><Image src="/logo.png" alt="" width={30} height={30} /> <span>Slip<span>Surge</span></span></Link>
      <nav aria-label="Research previews" className={styles.switcher}>
        <Link href="/preview/nba" aria-current={sport === 'nba' ? 'page' : undefined}>NBA</Link>
        <Link href="/preview/nfl" aria-current={sport === 'nfl' ? 'page' : undefined}>NFL</Link>
      </nav>
      <div className={styles.topActions}>
        <Link href={user ? '/feed' : signIn}>{user ? 'My account' : 'Sign in'}</Link>
        <Link className={styles.topUpgrade} href={paid ? workspace : pricing}>{paid ? 'Open workspace' : 'View Ultimate'}<ArrowRight size={14} /></Link>
      </div>
    </header>

    <div className={styles.content}>
      <section className={styles.intro} aria-labelledby="preview-title">
        <div className={styles.introCopy}>
          <div className={styles.eyebrow}><span className={styles.dot} />{config.label} RESEARCH PREVIEW</div>
          <h1 id="preview-title">{config.workspace}</h1>
          <p>See how a real {config.title.toLowerCase()} board moved. Pick a player, change the rung, and compare the saved price with its opening.</p>
          <div className={styles.introMeta}><span><Check size={14} /> Free to explore</span><span><Activity size={14} /> Saved pregame odds</span></div>
        </div>
        <div className={styles.matchup}>
          <div className={styles.matchupTop}><span>{board.example ? 'PAST GAME EXAMPLE' : 'FEATURED MATCHUP'}</span><span>{day(game.date)}</span></div>
          <div className={styles.matchupTeams}>
            {[game.away, game.home].map((team, index) => <div key={team} className={styles.matchupTeam}>
              <TeamMark sport={sport} team={team} large /><strong>{team}</strong>
              {scoreReady(game) && <span className={styles.matchupScore}>{index ? game.homeScore : game.awayScore}</span>}
            </div>)}
          </div>
          <div className={styles.matchupBottom}><span><Clock3 size={14} /> <GameMeta game={game} /></span><span>{board.book}</span></div>
        </div>
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.board} aria-labelledby="preview-market">
          <div className={styles.boardHeader}>
            <div><div className={styles.sectionLabel}>ODDS BOARD</div><h2 id="preview-market">{config.title}</h2></div>
            <div className={styles.boardActions}>
              <span className={styles.freeBadge}>FREE PREVIEW</span>
              {lockedLink(tools[sport][0], workspace, <>Markets</>, styles.lockButton)}
            </div>
          </div>
          <div className={styles.controls}>
            <label>Player<select value={selected?.id ?? ''} onChange={event => { setPlayer(Number(event.target.value)); setLine(null); explore('player') }}>
              {players.map(player => <option key={player.id} value={player.id}>{player.name} · {player.team}</option>)}
            </select></label>
            <label>Milestone<select value={activeLine ?? ''} onChange={event => { setLine(Number(event.target.value)); explore('rung') }}>
              {config.lines.map(rung => <option key={rung} value={rung}>{rung}+</option>)}
            </select></label>
            <span className={styles.book}><span>SPORTSBOOK</span>{board.book}</span>
          </div>

          {selected && <div className={styles.selection} aria-live="polite">
            <div className={styles.selectionPlayer}><TeamMark sport={sport} team={selected.team} /><div><span>{selected.team} · {activeLine}+</span><strong>{selected.name}</strong></div></div>
            <div><span>Last seen</span><strong>{selectedQuote ? priceText(selectedQuote.price) : '—'}</strong></div>
            <div><span>Opening</span><strong>{selectedQuote?.opening != null ? priceText(selectedQuote.opening) : '—'}</strong></div>
            <div><span>Movement</span>{selectedQuote ? <Movement quote={selectedQuote} /> : <span className={styles.noMove}>Price unavailable</span>}</div>
          </div>}

          <div className={styles.scroller} role="region" aria-label={config.title + ' ladder'} tabIndex={0}>
            <table className={styles.table}>
              <thead><tr><th scope="col">Player</th>{config.lines.map(rung => <th scope="col" key={rung} className={rung === activeLine ? styles.activeRung : undefined}>{rung}+</th>)}</tr></thead>
              <tbody>{players.map(player => <tr key={player.id} data-selected={player.id === selected?.id ? 'true' : undefined}>
                <th scope="row"><button className={styles.playerButton} type="button" aria-pressed={selected?.id === player.id} onClick={() => { setPlayer(player.id); setLine(null); explore('player') }}>
                  <TeamMark sport={sport} team={player.team} /><span><strong>{player.name}</strong><small>{player.team}</small></span>
                </button></th>
                {config.lines.map(rung => {
                  const quote = player.prices.find(value => value.line === rung)
                  return <td key={rung} className={rung === activeLine ? styles.activeRung : undefined}>
                    {quote ? <button type="button" className={styles.quoteButton} aria-pressed={selected?.id === player.id && rung === activeLine}
                      aria-label={player.name + ', ' + rung + ' plus, ' + priceText(quote.price)}
                      onClick={() => { setPlayer(player.id); setLine(rung); explore('rung') }}>
                      <strong>{priceText(quote.price)}</strong><span>Open {quote.opening === null ? '—' : priceText(quote.opening)}</span>
                    </button> : <span className={styles.emptyQuote} aria-label="Price unavailable">—</span>}
                  </td>
                })}
              </tr>)}</tbody>
            </table>
          </div>
          <div className={styles.boardFooter}>
            <span><ShieldCheck size={15} /> Saved {day(game.date)} matchup · Pregame only</span>
            {lockedLink(slateUnlock, workspace, <>Explore the full odds board</>, styles.inlineUnlock)}
          </div>
        </section>

        <aside className={styles.side}>
          <section className={styles.sideCard} aria-labelledby="preview-slate">
            <div className={styles.sectionLabel}>THE SCHEDULE</div><h2 id="preview-slate">{config.label} on {day(date)}</h2>
            {schedule.length ? <ul className={styles.schedule}>{schedule.map(row => <li key={row.id}>
              <span className={styles.scheduleTeams}><TeamMark sport={sport} team={row.away} />{row.away}<span>at</span><TeamMark sport={sport} team={row.home} />{row.home}</span>
              <span className={styles.scheduleMeta}>{scoreReady(row) && <strong>{row.awayScore}–{row.homeScore}</strong>}<GameMeta game={row} /></span>
            </li>)}</ul> : <p className={styles.sideCopy}>{scheduleAvailable ? 'No games are scheduled today.' : 'Today’s schedule is unavailable.'} The saved example is ready to explore.</p>}
          </section>
          <section className={styles.sideCard} aria-labelledby="preview-next">
            <div className={styles.sectionLabel}>ULTIMATE RESEARCH</div><h2 id="preview-next">Go deeper</h2>
            <div className={styles.lockedTools}>{tools[sport].map(feature => <div key={feature.feature}>
              {lockedLink(feature, workspace, <span>{feature.title}</span>, styles.lockedTool)}
            </div>)}</div>
          </section>
        </aside>
      </div>

      <section className={styles.unlockRail} aria-labelledby="unlock-rail">
        <div className={styles.lockArtwork} aria-hidden="true">
          <div className={styles.blurredRows}>{[0, 1, 2, 3].map(row => <div key={row}><i /><i /><i /><i /></div>)}</div>
          <span><LockKeyhole size={21} /></span>
        </div>
        <div><div className={styles.sectionLabel}>NBA AND NFL IN ONE MEMBERSHIP</div><h2 id="unlock-rail">Take the next matchup further.</h2><p>Unlock every matchup, more sportsbooks, and the research tools behind both boards.</p></div>
        {paid ? <Link href={workspace} className={styles.primaryButton}>Open {config.workspace}<ArrowRight size={17} /></Link>
          : <button type="button" className={styles.primaryButton} aria-haspopup="dialog" onClick={() => openUpgrade(slateUnlock)}>Unlock Ultimate<ArrowRight size={17} /></button>}
      </section>

      <footer className={styles.footer}><Link href="/">SlipSurge</Link><Link href="/responsible-gambling">Responsible Gambling</Link><Link href="/pricing">Memberships</Link></footer>
    </div>

    <ModalSurface open={unlock !== null} onClose={() => setUnlock(null)} labelledBy={dialogTitle} describedBy={dialogDescription}
      backdropClassName={styles.modalBackdrop} panelClassName={styles.modal}>
      {unlock && <>
        <button type="button" className={styles.close} aria-label="Close upgrade" onClick={() => setUnlock(null)} data-modal-autofocus><X size={20} /></button>
        <div className={styles.modalIcon}><LockKeyhole size={23} /></div>
        <div className={styles.sectionLabel}>SLIPSURGE ULTIMATE</div>
        <h2 id={dialogTitle}>{unlock.title}</h2>
        <p id={dialogDescription}>{unlock.body}</p>
        <div className={styles.modalBenefits}><span><Layers3 size={16} /> The Court and The Sideline</span><span><Check size={16} /> Every matchup and supported market</span></div>
        <Link href={pricing} className={styles.primaryButton} onClick={() => trackProductEvent('research_preview_upgrade_clicked', { sport, feature: unlock.feature })}>See Ultimate plans<ArrowRight size={17} /></Link>
        <button type="button" className={styles.dismiss} onClick={() => setUnlock(null)}>Keep exploring the free board</button>
      </>}
    </ModalSurface>
  </div>
}
