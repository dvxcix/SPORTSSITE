'use client'
import { useEffect, useState } from 'react'
import { nbaBinary, PAINT_MARKETS, type PaintPlayer, type PaintMarket } from '@/lib/nbaPaint'
import { number } from './PaintVisuals'
import styles from './paint.module.css'
export function PaintEstimate({ player, market, game }: { player: PaintPlayer; market: PaintMarket; game: number }) {
  const key = `${game}:${player.id}:${market}`
  const [state, setState] = useState<{ key: string; estimate: number | null; games: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/the-paint/estimate?${new URLSearchParams({ game: String(game), player: String(player.id), market })}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(115000)]) })
      .then(async response => { if (!response.ok) throw new Error('unavailable'); return response.json() })
      .then(data => { if (!controller.signal.aborted) { setState({ key, estimate: data.estimate, games: data.games }); setFailure(null) } })
      .catch(() => { if (!controller.signal.aborted) setFailure(key) })
    return () => controller.abort()
  }, [game, player.id, market, key, retry])
  const data = state?.key === key ? state : null, binary = nbaBinary(market)
  return <div className={styles.estimateCard}><span><small>{binary ? 'RECENT FREQUENCY' : 'PROJECTION'}</small><strong>{data?.estimate == null ? '—' : binary ? (data.estimate * 100).toFixed(1) + '%' : number(data.estimate)}</strong></span><div>{data?.estimate == null ? <small role="status">{failure === key ? 'Projection unavailable' : !data ? 'Loading projection…' : 'Limited history'}</small> : <><b>{PAINT_MARKETS.find(item => item.key === market)?.label}</b><small>{data.games} recent appearances</small></>}{failure === key && <button className={styles.filterToggle} onClick={() => { setFailure(null); setRetry(value => value + 1) }}>Retry</button>}</div></div>
}
