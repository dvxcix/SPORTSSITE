import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isArchiveDate, isBeforeSavedCutoff, savedMlbQuotes } from '@/lib/mlbArchiveView'

export type MlbArchiveSelection = { date?: string; game?: string; frame?: string }

type Game = { game_pk: string; game_date: string; home_abbr: string | null; away_abbr: string | null }
type Frame = { id: number; captured_at: string }
type Research = { observed_at: string; start_at: string; payload: unknown; source: string }

export async function loadMlbArchive(db: SupabaseClient, params: MlbArchiveSelection) {
  const latest = await db.from('pregame_odds_snapshots').select('game_date').order('game_date', { ascending: false }).limit(1)
  if (latest.error) throw new Error('Saved MLB archive unavailable')
  const latestDate = latest.data?.[0]?.game_date ?? null
  const date = params.date && isArchiveDate(params.date) ? params.date : latestDate ?? ''
  const result = date ? await db.from('pregame_odds_snapshots').select('game_pk,game_date,home_abbr,away_abbr').eq('game_date', date).order('game_pk').limit(50) : { data: [], error: null }
  if (result.error) throw new Error('Saved MLB archive unavailable')
  const games = (result.data ?? []) as Game[]
  const selected = games.find(game => game.game_pk === params.game) ?? games[0]
  let cutoff: string | null = null, frames: Frame[] = [], current: Frame | undefined, research: Research | null = null
  let saved: unknown = null
  if (selected) {
    const clock = await db.from('mlb_research_clock').select('start_at').eq('game_pk', selected.game_pk).maybeSingle()
    if (clock.error) throw new Error('Saved MLB archive unavailable')
    if (typeof clock.data?.start_at === 'string' && Number.isFinite(Date.parse(clock.data.start_at))) cutoff = clock.data.start_at
    if (cutoff) {
      const [history, firstHistory, board] = await Promise.all([
        db.from('pregame_odds_snapshot_history').select('id,captured_at').eq('game_pk', selected.game_pk).eq('game_date', date).lt('captured_at', cutoff).order('captured_at', { ascending: false }).order('id', { ascending: false }).limit(30),
        // Keep the original earliest saved frame accessible, even when more
        // than thirty later captures exist. This is an observed frame, not an
        // inferred opening price for contracts that appeared later.
        db.from('pregame_odds_snapshot_history').select('id,captured_at').eq('game_pk', selected.game_pk).eq('game_date', date).lt('captured_at', cutoff).order('captured_at', { ascending: true }).order('id', { ascending: true }).limit(1),
        db.from('mlb_pregame_research').select('observed_at,start_at,payload,source').eq('game_pk', selected.game_pk).eq('resource', 'board:v1').maybeSingle(),
      ])
      if (history.error || firstHistory.error || board.error) throw new Error('Saved MLB archive unavailable')
      const seen = new Set<number>()
      frames = ([...(history.data ?? []), ...(firstHistory.data ?? [])] as Frame[]).filter(row => {
        if (!Number.isSafeInteger(row.id) || seen.has(row.id) || !isBeforeSavedCutoff(row.captured_at, cutoff)) return false
        seen.add(row.id)
        return true
      })
      current = frames.find(row => String(row.id) === params.frame) ?? frames[0]
      const boardRow = board.data as Research | null
      if (boardRow && ['capture', 'recovered-cache'].includes(boardRow.source) && isBeforeSavedCutoff(boardRow.observed_at, cutoff) && isBeforeSavedCutoff(boardRow.observed_at, boardRow.start_at)) research = boardRow
      if (current) {
        const entry = await db.from('pregame_odds_snapshot_history').select('captured_at,prop_map').eq('id', current.id).eq('game_pk', selected.game_pk).eq('game_date', date).lt('captured_at', cutoff).maybeSingle()
        if (entry.error) throw new Error('Saved MLB archive unavailable')
        if (entry.data && isBeforeSavedCutoff(entry.data.captured_at, cutoff) && entry.data.captured_at === current.captured_at) saved = entry.data.prop_map
      }
    }
  }
  const quotes = savedMlbQuotes(saved)
  const rawResearch = research?.payload == null ? '' : JSON.stringify(research.payload, null, 2)
  const researchDisplay = rawResearch.length <= 1_000_000 ? rawResearch : ''
  return { date, latestDate, games, selected, cutoff, frames, current, research, quotes, researchDisplay }
}
