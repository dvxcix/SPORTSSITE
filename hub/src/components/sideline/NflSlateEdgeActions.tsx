'use client'
import { useRef, useState } from 'react'
import { Star, Share2, ArrowUpRight, Send } from 'lucide-react'
import { useWatchlist } from '@/context/WatchlistContext'
import type { NflSlateEdgeEntry, NflSlateEdgeMarketKey } from '@/lib/nflSlateEdge'
import type { SlateEdgeEvidence, SlateEdgeEvidenceView, SlateEdgeEvidenceWindow } from '@/lib/slateEdgeEvidence'
import { SlateEdgeShareModal } from '@/components/social/SlateEdgeShareModal'

export function NflSlateEdgeActions({ entry, focus, date, sample, view, rank, onClose }: {
  entry: NflSlateEdgeEntry; focus: NflSlateEdgeMarketKey; date: string; sample: string; view: SlateEdgeEvidenceView; rank: number; onClose: () => void
}) {
  const wl = useWatchlist()
  const [evidence, setEvidence] = useState<SlateEdgeEvidence | null>(null)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const selection = entry.markets[focus].selection
  const existing = selection && wl.items.find(item => item.status === 'pending' && item.sport.toLowerCase() === 'nfl' && item.game_pk === selection.game_pk && item.nfl_selection?.player_id === selection.nfl_selection?.player_id && item.prop_key === selection.prop_key && item.book === selection.book)
  const path = `/the-sideline?${new URLSearchParams({ date, game: entry.gameId, sample })}#${encodeURIComponent(`nfl-player-${entry.gameId}-${entry.id}`)}`
  async function save(post: boolean) {
    if (lock.current || !selection) return
    lock.current = true; setBusy(true); setError('')
    try {
      if (!wl.signedIn) throw new Error('Sign in to save this selection.')
      if (existing && !post) await wl.remove(existing.id)
      else if (!existing) await wl.add(selection)
      if (post) { onClose(); window.dispatchEvent(new Event('ss:open-watchlist')) }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save. Please retry.') }
    finally { lock.current = false; setBusy(false) }
  }
  function share() {
    setEvidence({ version: 1, kind: 'slate_edge_player', sport: 'NFL', capturedAt: new Date().toISOString(),
      source: { path, date, window: (['l1','l3','l5','l10'].includes(sample) ? sample : 'season') as SlateEdgeEvidenceWindow, view, gameKey: entry.gameId, playerId: null },
      snapshot: { name: entry.name, team: entry.team, position: entry.position, battingOrder: null, awayAbbr: entry.awayAbbr, homeAbbr: entry.homeAbbr, rank, edge: null, marketScore: null, marketOverlay: null, score: entry.score[focus], tags: [], hr: null, hrBaseline: null, fhr: null, fhrBaseline: null },
      nfl: { entry, focus, sampleLabel: sample.toUpperCase() },
    })
  }
  const control = { minHeight: 44, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 } as const
  return <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, gridColumn: '1 / -1', minWidth: 0 }} onClick={event => event.stopPropagation()}>
    {selection && <><button type="button" style={control} disabled={busy} aria-pressed={!!existing} onClick={() => void save(false)}><Star size={14} fill={existing ? 'currentColor' : 'none'} />{existing ? 'Saved' : 'Save'}</button><button type="button" style={control} disabled={busy} onClick={() => void save(true)}><Send size={14} />Post Pick</button></>}
    <button type="button" style={control} onClick={share}><Share2 size={14} />Share / Workspace</button>
    <a style={control} href={path}><ArrowUpRight size={14} />Open Board</a>
    {error && <small role="alert">{error}</small>}
    <SlateEdgeShareModal evidence={evidence} onClose={() => setEvidence(null)} />
  </span>
}
