'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { Flame, Radio, X } from 'lucide-react'
import type { NflTouchdownEvent } from '@/lib/nflTouchdownFeed'
import styles from './touchdownTracker.module.css'

const KIND_LABELS: Record<NflTouchdownEvent['kind'], string> = {
  receiving: 'Receiving TD', rushing: 'Rushing TD', return: 'Return TD', defense: 'Defensive TD', other: 'Touchdown',
}

function Avatar({ event }: { event: NflTouchdownEvent }) {
  const [failed, setFailed] = useState(false)
  return <span className={styles.avatar}>
    {event.headshot && !failed
      ? <Image unoptimized src={event.headshot} alt={`${event.playerName} headshot`} width={48} height={48} onError={() => setFailed(true)} />
      : <b>{event.playerName.split(' ').map(part => part[0]).slice(0, 2).join('')}</b>}
    {event.teamLogo ? <Image unoptimized className={styles.teamLogo} src={event.teamLogo} alt="" width={18} height={18} /> : null}
  </span>
}

export function NflTouchdownTracker({ events, onJumpToGame }: { events: NflTouchdownEvent[]; onJumpToGame: (gameId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | NflTouchdownEvent['kind']>('all')
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open])

  const visible = useMemo(() => events.filter(event => filter === 'all' || event.kind === filter), [events, filter])
  const firstCount = events.filter(event => event.isFirstTdOfGame).length
  return <>
    <button type="button" className={events.length ? styles.triggerLive : undefined} onClick={() => setOpen(true)} aria-label={`Open today's touchdown tracker, ${events.length} touchdowns`}>
      <Flame size={15} /> Touchdowns
      <span className={styles.count}>{events.length}</span>
    </button>
    {open && typeof document !== 'undefined' ? createPortal(
      <div className={styles.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="nfl-touchdown-title">
          <header>
            <span className={styles.flame}><Flame size={20} /></span>
            <div>
              <small>LIVE SCORING BOARD</small>
              <h2 id="nfl-touchdown-title">Today&apos;s Touchdowns</h2>
              <p>{events.length} touchdowns · {firstCount} first scorers across the slate</p>
            </div>
            <span className={styles.live}><Radio size={12} /> LIVE</span>
            <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Close touchdown tracker"><X size={18} /></button>
          </header>
          <nav aria-label="Touchdown type">
            {(['all', 'receiving', 'rushing', 'return', 'defense'] as const).map(kind => <button key={kind} type="button" className={filter === kind ? styles.active : ''} onClick={() => setFilter(kind)}>{kind === 'all' ? 'All TDs' : KIND_LABELS[kind]}</button>)}
          </nav>
          <div className={styles.list}>
            {!visible.length ? <div className={styles.empty}>No touchdowns in this view yet.</div> : visible.map(event => <article key={event.id}>
              <button type="button" className={styles.eventButton} onClick={() => { onJumpToGame(event.gameId); setOpen(false) }} aria-label={`Open ${event.team} versus ${event.opponent} in The Sideline`}>
                <Avatar event={event} />
                <span className={styles.identity}>
                  <span><strong>{event.playerName}</strong>{event.isFirstTdOfGame ? <mark>1ST</mark> : null}{event.playerTdNumber > 1 ? <mark>{event.playerTdNumber} TD</mark> : null}</span>
                  <small>{event.team} · {KIND_LABELS[event.kind]}{event.yards != null ? ` · ${event.yards} YD` : ''}</small>
                  <em>{event.text}</em>
                </span>
                <span className={styles.moment}>
                  <b>Q{event.quarter} · {event.clock}</b>
                  <small>{event.team} vs {event.opponent}</small>
                  <em>{event.awayScore}–{event.homeScore}</em>
                </span>
              </button>
            </article>)}
          </div>
          <footer>Updates with The Sideline&apos;s live game refresh.</footer>
        </section>
      </div>, document.body) : null}
  </>
}
