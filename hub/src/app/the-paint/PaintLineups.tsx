'use client'
import { publicWorkspaceFetch as fetch } from '@/lib/publicWorkspaceClient'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Clock3 } from 'lucide-react'
import type { PaintBoard, PaintPlayer, PaintTeam } from '@/lib/nbaPaint'
import { nbaGameFinal, nbaGameStart, nbaPregameOpen } from '@/lib/nbaOddsMode'
import { nbaModeHref } from '@/lib/nbaModeHref'
import type { NbaGameLineups, NbaLineupTeam } from '@/lib/nbaLineups'
import { useNbaOddsMode } from '@/components/nba/NbaOddsModeContext'
import { watchNbaRefresh } from '@/lib/nbaRefresh'
import { PlayerAvatar } from './PaintVisuals'
import detail from './PaintMatchup.module.css'

export function usePaintLineups(board: PaintBoard, enabled: boolean) {
  const mode = useNbaOddsMode(), cutoff = nbaGameStart(board.game)
  const key = `${board.game.id}:${mode}:${cutoff}`
  const polling = nbaPregameOpen(board.game) || mode === 'live' && !nbaGameFinal(board.game)
  const [state, setState] = useState<{ key: string; value: NbaGameLineups | null; failed: boolean } | null>(null), [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController(); let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const response = await fetch(nbaModeHref(`/the-paint/lineups?game=${board.game.id}`, mode), { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) })
        if (response.status === 401 || response.status === 403) { if (!controller.signal.aborted) setState({ key, value: null, failed: true }); return }
        if (!response.ok) throw new Error('Lineup read failed')
        const value = await response.json() as NbaGameLineups
        if (value.gameId !== board.game.id || value.mode !== mode || !Array.isArray(value.teams) || value.teams.length > 2 || !Number.isFinite(Date.parse(value.cutoffAt))) throw new Error('Invalid lineup context')
        if (!controller.signal.aborted) setState({ key, value, failed: value.unavailable })
      } catch { if (!controller.signal.aborted) setState(prior => ({ key, value: prior?.key === key ? prior.value : null, failed: true })) }
      finally { pending = false }
    }
    void load()
    const stop = polling ? watchNbaRefresh(load, 30000) : () => {}
    return () => { controller.abort(); stop() }
  }, [board.game.id, key, mode, enabled, retry, polling])
  const value = state?.key === key ? state.value : null, bound = Math.min(cutoff ?? -Infinity, Date.parse(value?.cutoffAt ?? ''))
  return { loading: enabled && state?.key !== key, failed: state?.key === key && state.failed,
    teams: value?.teams.filter(team => [board.game.home_team.id, board.game.visitor_team.id].includes(team.teamId) && Array.isArray(team.players) && team.players.length === 5 && (team.source === 'game' ? mode === 'live' && team.status === 'actual' : team.source === 'pregame' && Date.parse(team.observedAt) < bound)) ?? [],
    retry: () => setRetry(value => value + 1),
  }
}

export function PaintLineupTeam({ board, team, lineup, loading, failed, retry }: { board: PaintBoard; team: PaintTeam; lineup?: NbaLineupTeam; loading: boolean; failed: boolean; retry: () => void }) {
  const mode = useNbaOddsMode(), open = nbaPregameOpen(board.game)
  const label = lineup?.status === 'actual' ? 'Actual starters' : lineup?.status === 'confirmed' ? 'Confirmed pregame' : 'Expected lineup'
  return <footer className={detail.starters}>
    {lineup ? <>
      <div className={detail.lineupHeading}><span className={detail.starterStatus} data-confirmed={lineup.status !== 'expected'}>{lineup.status === 'expected' ? <Clock3 size={13}/> : <Check size={13}/>} {label}</span><time dateTime={lineup.observedAt} title={`${lineup.source === 'pregame' ? 'Pregame source updated' : 'Actual lineup checked'} ${lineup.observedAt}`}>{new Date(lineup.observedAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET</time></div>
      <ul className={detail.starterList} aria-label={`${team.full_name} ${label.toLowerCase()}`}>{lineup.players.map(entry => {
        const player: PaintPlayer = board.players.find(player => player.id === entry.id && player.team.id === team.id) ?? { id: entry.id, first_name: entry.firstName, last_name: entry.lastName, position: '', team, headshot: null, injury: null, average: {}, props: [], logs: [] }
        const fullName = `${entry.firstName} ${entry.lastName}`
        return <li key={entry.id}><Link className={detail.starterLink} href={nbaModeHref(`/nba/players/${entry.id}?game=${board.game.id}`, mode)} aria-label={`${fullName}, ${entry.position ?? 'game position unavailable'}, ${label.toLowerCase()}`} title={`${fullName} · ${entry.position ?? 'Game position unavailable'}`}><PlayerAvatar player={player}/><b className={detail.slot} aria-label="Game position">{entry.position ?? '—'}</b><span className={detail.starterName}>{entry.firstName.charAt(0)}. {entry.lastName}</span></Link></li>
      })}</ul>
      {failed && <button type="button" className={detail.lineupRetry} onClick={retry}>Last saved lineup · Retry</button>}
    </> : <span className={detail.lineupEmpty} role="status">{loading ? 'Loading lineup…' : failed ? 'Lineup unavailable' : open ? 'Lineup pending' : mode === 'pregame' ? 'No pre-tip lineup recorded' : 'Actual starters not reported'}{failed && <button type="button" onClick={retry}>Retry</button>}</span>}
  </footer>
}
