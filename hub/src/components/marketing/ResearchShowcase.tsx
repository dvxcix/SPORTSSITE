'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { nflOddsBoardMove } from '@/lib/nflOddsBoard'
import { PREVIEW_CONFIG, type PreviewSport } from '@/lib/publicResearchPreview'
import { PUBLIC_PREVIEW_EXAMPLES } from '@/lib/publicResearchPreviewExamples'
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
  if (value === null) return '—'
  return value > 0 ? '+' + value : '−' + Math.abs(value)
}

function movement(price: number, opening: number | null) {
  const delta = nflOddsBoardMove(price, opening)
  if (delta === null) return <span className={styles.muted}>—</span>
  if (delta === 0) return <span className={styles.muted}>Unchanged</span>
  const magnitude = Math.abs(delta)
  const label = delta > 0 ? 'Shortened' : 'Lengthened'
  return <span className={delta > 0 ? styles.shortened : styles.lengthened}>
    <span>{delta > 0 ? '+' : '−'}{magnitude < .05 ? '<0.1' : magnitude.toFixed(1)} pp</span>
    <small>{label}</small>
  </span>
}

export function ResearchShowcase() {
  const [sport, setSport] = useState<PreviewSport>('nba')
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const config = PREVIEW_CONFIG[sport]
  const example = examples[sport]
  const board = PUBLIC_PREVIEW_EXAMPLES[sport]
  const line = selectedLine ?? example.defaultLine
  const featured = board.players.find(player => player.id === example.featuredPlayer)
  const featureQuote = featured?.prices.find(quote => quote.line === line)

  function selectSport(next: PreviewSport) {
    if (sport === next) return
    setSport(next)
    setSelectedLine(null)
  }

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseBar}>
        <div className={styles.sportControl} role="group" aria-label="Example sport">
          <button type="button" aria-pressed={sport === 'nba'} onClick={() => selectSport('nba')}>NBA</button>
          <button type="button" aria-pressed={sport === 'nfl'} onClick={() => selectSport('nfl')}>NFL</button>
        </div>
        <span>{config.workspace} <span className={styles.muted}>/</span> {config.title}</span>
      </div>
      <div className={styles.showcaseBody}>
        <div className={styles.board}>
          <div className={styles.boardHeading}>
            <h3>{board.game.away} at {board.game.home}</h3>
            <span>Nov 8, 2026 · {board.book}</span>
          </div>
          <div className={styles.milestones} role="group" aria-label={config.title + ' milestones'}>
            {example.lines.map(rung => (
              <button key={rung} type="button" aria-pressed={rung === line} onClick={() => setSelectedLine(rung)}>{rung}+</button>
            ))}
          </div>
          <table className={styles.oddsTable}>
            <caption className={styles.srOnly}>{config.title}, {line}+ milestone. Movement in implied probability.</caption>
            <thead><tr><th scope="col">Player</th><th scope="col">Open</th><th scope="col">Last seen</th><th scope="col">Move</th></tr></thead>
            <tbody>
              {example.players.map(id => {
                const player = board.players.find(row => row.id === id)
                if (!player) return null
                const quote = player.prices.find(row => row.line === line)
                return <tr key={id}>
                  <th scope="row">{player.name}<small>{player.team}</small></th>
                  <td>{odds(quote?.opening ?? null)}</td>
                  <td className={styles.savedPrice}>{odds(quote?.price ?? null)}</td>
                  <td>{quote ? movement(quote.price, quote.opening) : <span className={styles.muted}>—</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        <aside className={styles.readout}>
          <p className={styles.kicker}>From price to result</p>
          <h3>{featured?.name}</h3>
          {featureQuote && featureQuote.opening !== null && (
            <p className={styles.readoutText}>The {line}+ {config.title.toLowerCase()} price moved from <strong>{odds(featureQuote.opening)}</strong> at open to <strong>{odds(featureQuote.price)}</strong> at the last saved pregame check.</p>
          )}
          <div className={styles.result}>
            <span>Final box score</span>
            <a href={example.resultSource}>{example.result}</a>
          </div>
          <Link href={'/preview/' + sport} className={styles.textLink}>Open the free {config.label} board <ArrowRight size={16} /></Link>
        </aside>
      </div>
    </div>
  )
}
