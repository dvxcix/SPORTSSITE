'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import type { PaintBoard } from '@/lib/nbaPaint'
import styles from './nbaMatrix.module.css'
import { useRouter } from 'next/navigation'

type Match = { id: string; name: string; color: string; playerIds: number[]; missing: number }
type Player = { id: number; name: string; gameId: number; team: string }
type State = { matches: Match[]; players: Player[]; error: string; loading: boolean; refresh: () => void }
const Context = createContext<State>({ matches: [], players: [], error: '', loading: false, refresh: () => {} })
export function useNbaMatrixMatches(playerId: number) { return useContext(Context).matches.filter(match => match.playerIds.includes(playerId)) }
export function NbaMatrixProvider({ board, gameIds, children }: { board: PaintBoard | null; gameIds?: number[]; children: ReactNode }) {
  const scopeKey = (gameIds?.length ? gameIds : board ? [board.game.id] : []).slice(0,16).join(',')
  const [state, setState] = useState<{ scopeKey: string; matches: Match[]; players: Player[] } | null>(null)
  const [error, setError] = useState(''), [loading, setLoading] = useState(false), [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(v => v + 1), [])
  useEffect(() => {
    const stop = watchNbaRefresh(refresh)
    window.addEventListener('ss:nba-matrices-updated', refresh)
    window.addEventListener('nba-matrices-changed', refresh)
    return () => { stop(); window.removeEventListener('ss:nba-matrices-updated', refresh); window.removeEventListener('nba-matrices-changed', refresh) }
  }, [refresh])
  useEffect(() => {
    if (!scopeKey) return
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const ids = scopeKey.split(',').map(Number), results: { matches: Match[]; players?: Player[]; unavailable?: string[] }[] = []
        let failed = 0
        for (let offset=0; offset<ids.length; offset+=3) {
          const batch = await Promise.allSettled(ids.slice(offset,offset+3).map(async gameId => {
            const response = await fetch(`/api/nba-matrices/evaluate?game=${gameId}`, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(110000)]) })
            const result = await response.json()
            if (!response.ok || result.gameId !== gameId) throw new Error()
            return result
          }))
          for (const result of batch) { if (result.status === 'fulfilled') results.push(result.value); else failed++ }
        }
        if (!results.length) throw new Error()
        const combined = new Map<string, Match>()
        for (const match of results.flatMap(r => r.matches)) {
          const previous = combined.get(match.id)
          combined.set(match.id, { ...match, playerIds: [...new Set([...previous?.playerIds ?? [], ...match.playerIds])], missing: (previous?.missing ?? 0)+match.missing })
        }
        const unavailable = [...new Set(results.flatMap(r=>r.unavailable??[]))]
        if (!controller.signal.aborted) {
          setState({ scopeKey, matches:[...combined.values()], players:results.flatMap(r=>r.players??[]) })
          setError(failed ? `${failed} games unavailable` : unavailable.length ? `${unavailable.join(', ')} unavailable` : '')
        }
      } catch { if (!controller.signal.aborted) { setState(null); setError('Matrix results unavailable') } }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void run(); return () => controller.abort()
  }, [scopeKey, board?.game.id, board?.fetchedAt, revision])
  const current = state?.scopeKey === scopeKey ? state : null
  return <Context.Provider value={{ matches: current?.matches ?? [], players: current?.players ?? [], error, loading, refresh }}>{children}</Context.Provider>
}
export function NbaMatrixResults({ board, open }: { board: PaintBoard; open: (playerId: number) => void }) {
  const router = useRouter()
  const { matches, players: pool, loading, error, refresh } = useContext(Context)
  const [selected, setSelected] = useState('all')
  const active = selected === 'all' ? matches : matches.filter(m => m.id === selected)
  const players = pool.filter(player => active.some(m => m.playerIds.includes(player.id)))
  if (!matches.length && !error) return null
  return <section className={styles.results} aria-label="NBA Matrix results" aria-busy={loading}>
    <div className={styles.resultsHead}><b>Matrices</b><select aria-label="NBA Matrix results" value={selected} onChange={e => setSelected(e.target.value)}><option value="all">All enabled matrices</option>{matches.map(m => <option key={m.id} value={m.id}>{m.name} · {m.playerIds.length}</option>)}</select><span>{loading ? 'Refreshing…' : `${players.length} matches`}</span><button type="button" onClick={() => window.dispatchEvent(new Event('ss:open-nba-matrices'))}>Manage</button></div>
    <div className={styles.matches}>{players.map(player => <button type="button" key={`${player.gameId}:${player.id}`} onClick={() => player.gameId === board.game.id ? open(player.id) : router.push(`/the-paint?game=${player.gameId}&date=${board.game.date}&player=${player.id}`)} style={{ borderColor: active.find(m => m.playerIds.includes(player.id))?.color }}>{player.name} · {player.team}{active.filter(m => m.playerIds.includes(player.id)).map(m => <small key={m.id} style={{ color: m.color }}>{m.name}</small>)}</button>)}</div>
    {error && <div role="status">{error}<button type="button" onClick={refresh}>Retry</button></div>}
  </section>
}
