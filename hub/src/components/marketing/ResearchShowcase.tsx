'use client'

import { useState } from 'react'
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { nflOddsBoardMove } from '@/lib/nflOddsBoard'
import { PREVIEW_CONFIG, previewPagePath, type PreviewSport } from '@/lib/publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from '@/lib/publicResearchPreviewExamples'
import { trackProductEvent } from '@/lib/productAnalytics'
import { DiscoveryLink } from './DiscoveryLink'
import styles from './LandingPage.module.css'

const examples = {
  nba: {
    featuredPlayer: 17553995,
    players: [17553995, 17896075, 413],
    lines: [15, 20, 25, 30, 35],
    defaultLine: 25,
    result: '43 points',
    resultSource: 'https://www.nba.com/game/lal-vs-det-0022600197/box-score',
  },
  nfl: {
    featuredPlayer: 903,
    players: [903, 13874670, 13874242],
    lines: [10, 25, 40, 50, 60],
    defaultLine: 40,
    result: '25 receiving yards',
    resultSource: 'https://www.nfl.com/players/cade-otton/stats/logs/2026/',
  },
} as const

function odds(value: number | null) {
  if (value === null) return '–'
  return value > 0 ? '+' + value : '−' + Math.abs(value)
}

function movement(price: number, opening: number | null) {
  const delta = nflOddsBoardMove(price, opening)
  if (delta === null) return <span className={styles.muted}>–</span>
  if (delta === 0) return <span className={styles.muted} aria-label="Odds unchanged"><Minus size={14} aria-hidden="true" /></span>
  const magnitude = Math.abs(delta)
  const Icon = delta > 0 ? TrendingUp : TrendingDown
  return <span className={delta > 0 ? styles.shortened : styles.lengthened} aria-label={`Odds ${delta > 0 ? 'shortened' : 'lengthened'} by ${magnitude.toFixed(1)} probability points`}>
    <Icon size={14} aria-hidden="true" /><span>{delta > 0 ? '+' : '−'}{magnitude < .05 ? '<0.1' : magnitude.toFixed(1)}<small> pp</small></span>
  </span>
}

export function ResearchShowcase() {
  const [sport, setSport] = useState<PreviewSport>('nba')
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null)
  const config = PREVIEW_CONFIG[sport]
  const example = examples[sport]
  const board = PUBLIC_PREVIEW_EXAMPLES[sport]
  const line = selectedLine ?? example.defaultLine
  const featured = board.players.find(player => player.id === (selectedPlayer ?? example.featuredPlayer))
  const featureQuote = featured?.prices.find(quote => quote.line === line)
  const fullPreview = previewPagePath({sport,game:board.game.id,date:board.game.date,player:featured?.id,line})

  function selectSport(next: PreviewSport) {
    if (sport === next) return
    setSport(next)
    setSelectedLine(null)
    setSelectedPlayer(null)
    trackProductEvent('public_preview_interacted', { sport: next, action: 'sport' })
  }

  return (
    <div className={styles.showcase} data-preview-sport={sport}>
      <div className={styles.showcaseBar}>
        <div className={styles.previewIdentity}><h2>{config.workspace}</h2><span>{config.title}</span></div>
        <div className={styles.sportControl} role="group" aria-label="Example sport">
          <button type="button" aria-pressed={sport === 'nba'} onClick={() => selectSport('nba')}>NBA</button>
          <button type="button" aria-pressed={sport === 'nfl'} onClick={() => selectSport('nfl')}>NFL</button>
        </div>
      </div>
      <div className={styles.showcaseBody} key={sport}>
        <div className={styles.board}>
          <div className={styles.boardHeading}>
            <h3>{board.game.away} at {board.game.home}</h3>
            <span>Saved Nov 8, 2026 · {board.book}</span>
          </div>
          <div className={styles.milestones} role="group" aria-label={config.title + ' milestones'}>
            {example.lines.map(rung => (
              <button key={rung} type="button" aria-pressed={rung === line} onClick={() => {setSelectedLine(rung);trackProductEvent('public_preview_interacted',{sport,action:'milestone'})}}>{rung}+</button>
            ))}
          </div>
          <div className={styles.showcaseScroll} role="region" aria-label={config.title + ' saved example'} tabIndex={0}>
          <table className={styles.oddsTable}>
            <caption className={styles.srOnly}>{config.title}, {line}+ milestone. Saved pregame example from November 8, 2026.</caption>
            <thead><tr><th scope="col">Player</th><th scope="col">Open</th><th scope="col">Last seen</th><th scope="col">Move</th></tr></thead>
            <tbody>
              {example.players.map(id => {
                const player = board.players.find(row => row.id === id)
                if (!player) return null
                const quote = player.prices.find(row => row.line === line)
                return <tr key={id} data-selected={featured?.id === id}>
                  <th scope="row"><button type="button" aria-label={`Inspect ${player.name}`} aria-pressed={featured?.id === id} onClick={()=>{setSelectedPlayer(id);trackProductEvent('public_preview_interacted',{sport,action:'player'})}}>{player.name}<small>{player.team}</small></button></th>
                  <td>{odds(quote?.opening ?? null)}</td>
                  <td className={styles.savedPrice}>{odds(quote?.price ?? null)}</td>
                  <td>{quote ? movement(quote.price, quote.opening) : <span className={styles.muted} aria-label="No saved quote">–</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
          </div>
          <p className={styles.boardHint}>Choose a player or milestone. These are archived prices.</p>
        </div>
        <aside className={styles.readout} aria-label="Selected player" aria-live="polite">
          <p className={styles.kicker}>{line}+ {config.title.toLowerCase()}</p>
          <h3>{featured?.name}</h3>
          <dl className={styles.selectionPrices}><div><dt>Open</dt><dd>{odds(featureQuote?.opening ?? null)}</dd></div><div><dt>Last seen</dt><dd>{odds(featureQuote?.price ?? null)}</dd></div></dl>
          {!featureQuote && <p className={styles.readoutText}>No saved price for this milestone. Choose another line.</p>}
          {featured?.id === example.featuredPlayer && <div className={styles.result}>
            <span>Final box score</span>
            <a href={example.resultSource}>{example.result}</a>
          </div>}
          <DiscoveryLink href={fullPreview} destination={sport + '_preview'} className={styles.openBoard}>Open {config.label} preview <ArrowRight size={16} aria-hidden="true" /></DiscoveryLink>
        </aside>
      </div>
    </div>
  )
}
