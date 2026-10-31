import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isArchiveDate, isBeforeSavedCutoff, savedMlbQuotes } from '@/lib/mlbArchiveView'

export const dynamic = 'force-dynamic'

type Game = { game_pk: string; game_date: string; home_abbr: string | null; away_abbr: string | null }
type Frame = { id: number; captured_at: string }
type Research = { observed_at: string; start_at: string; payload: unknown; source: string }

/** The admin shell also checks access, but this page checks before any service-role read. */
async function requireArchiveAdmin() {
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) redirect('/auth/login?next=/admin/mlb-archive')
  const [{ data: profile, error: profileError }, { data: assurance, error: mfaError }] = await Promise.all([
    client.from('users').select('account_type').eq('id', user.id).maybeSingle(),
    client.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (profileError || profile?.account_type !== 'admin') notFound()
  if (mfaError || !assurance) throw new Error('Admin verification temporarily unavailable')
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') redirect('/settings/security?next=/admin/mlb-archive')
}

export default async function MlbArchivePage({ searchParams }: { searchParams: Promise<{ date?: string; game?: string; frame?: string }> }) {
  await requireArchiveAdmin()
  const params = await searchParams
  const db = createAdminClient()
  const latest = await db.from('pregame_odds_snapshots').select('game_date').order('game_date', { ascending: false }).limit(1)
  if (latest.error) throw new Error('Saved MLB archive unavailable')
  const date = params.date && isArchiveDate(params.date) ? params.date : latest.data?.[0]?.game_date ?? ''
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

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-[var(--text-1)] sm:px-6">
    <header><p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Admin research</p><h1 className="mt-2 text-2xl font-black">MLB archive</h1><p className="mt-2 text-sm text-[var(--text-2)]">Browse saved pregame observations by date and game. No live imports are run here.</p></header>
    <form className="flex flex-wrap items-end gap-3" action="/admin/mlb-archive">
      <label className="grid gap-1 text-xs font-semibold">Date<input type="date" name="date" defaultValue={date} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
      <button className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black" type="submit">View date</button>
    </form>
    {!games.length ? <p className="text-sm text-[var(--text-2)]">No saved game snapshots are available for this date.</p> : <>
      <nav aria-label="Saved games" className="flex flex-wrap gap-2">{games.map(game => <Link key={game.game_pk} href={`/admin/mlb-archive?date=${encodeURIComponent(date)}&game=${encodeURIComponent(game.game_pk)}`} aria-current={game.game_pk === selected?.game_pk ? 'page' : undefined} className="rounded-md border border-[var(--border)] px-3 py-2 text-sm">{game.away_abbr ?? 'Away'} @ {game.home_abbr ?? 'Home'} · {game.game_pk}</Link>)}</nav>
      {!cutoff ? <p role="status" className="text-sm text-[var(--text-2)]">A saved pregame cutoff is unavailable for this game, so prices cannot be shown safely.</p> : <>
        <p className="text-xs text-[var(--text-2)]">Saved pregame cutoff: <time>{cutoff}</time>. Values below retain their original capture time.</p>
        {!frames.length ? <p className="text-sm text-[var(--text-2)]">No saved price observations are available before the cutoff.</p> : <>
          <form action="/admin/mlb-archive" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="date" value={date}/><input type="hidden" name="game" value={selected?.game_pk}/>
            <label className="grid gap-1 text-xs font-semibold">Captured observation<select name="frame" defaultValue={String(current?.id)} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">{frames.map(frame => <option key={frame.id} value={frame.id}>{frame.captured_at}</option>)}</select></label>
            <button type="submit" className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-bold">View observation</button>
          </form>
          <p className="text-xs text-[var(--text-2)]">Showing the first saved observation and up to 30 latest observations. Values marked with a line key are lines, not odds.</p>
          {quotes.rows.length ? <div className="overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Player</th><th className="p-2">Market key</th><th className="p-2">Book</th><th className="p-2">Saved value</th></tr></thead><tbody>{quotes.rows.map((row, index) => <tr key={`${row.playerKey}:${row.market}:${row.book}:${index}`} className="border-t border-[var(--border)]"><td className="p-2">{row.player}</td><td className="p-2">{row.market}</td><td className="p-2">{row.book}</td><td className="p-2">{row.value}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--text-2)]">This saved observation has no displayable market values.</p>}
          {quotes.truncated && <p className="text-xs text-[var(--text-2)]">Only the first 1,500 saved values are shown.</p>}
        </>}
        {research && <details className="rounded-lg border border-[var(--border)] p-4"><summary className="cursor-pointer text-sm font-semibold">Saved research inputs · {research.observed_at}</summary>{researchDisplay ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{researchDisplay}</pre> : <p className="mt-3 text-sm">This saved research snapshot is too large to display here.</p>}</details>}
        {!research && <p className="text-xs text-[var(--text-2)]">A saved pregame research snapshot is not available for this game.</p>}
      </>}
    </>}
  </div>
}
