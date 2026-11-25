import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadMlbArchive, type MlbArchiveSelection } from '@/lib/mlbArchiveReader'

export const dynamic = 'force-dynamic'

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

export default async function MlbArchivePage({ searchParams }: { searchParams: Promise<MlbArchiveSelection> }) {
  await requireArchiveAdmin()
  const { date, games, selected, cutoff, frames, current, research, quotes, researchDisplay } =
    await loadMlbArchive(createAdminClient(), await searchParams)

  return <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 text-[var(--text-1)] sm:px-6">
    <header><p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Admin research</p><h1 className="mt-2 text-2xl font-semibold">MLB archive</h1><p className="mt-2 text-sm text-[var(--text-2)]">Browse saved pregame observations by date and game. No live imports are run here.</p></header>
    <form className="flex flex-wrap items-end gap-3" action="/admin/mlb-archive">
      <label className="grid gap-1 text-xs font-semibold">Date<input type="date" name="date" defaultValue={date} className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm" /></label>
      <button className="rounded-md bg-[var(--accent-fill)] px-4 py-2 text-sm font-bold text-[var(--accent-fg)]" type="submit">View date</button>
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
          {quotes.rows.length ? <div role="region" tabIndex={0} aria-label=" table, scroll for all columns" className="ss-table-region overflow-x-auto rounded-lg border border-[var(--border)]"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Player</th><th className="p-2">Market key</th><th className="p-2">Book</th><th className="p-2">Saved value</th></tr></thead><tbody>{quotes.rows.map((row, index) => <tr key={`${row.playerKey}:${row.market}:${row.book}:${index}`} className="border-t border-[var(--border)]"><td className="p-2">{row.player}</td><td className="p-2">{row.market}</td><td className="p-2">{row.book}</td><td className="p-2">{row.value}</td></tr>)}</tbody></table></div> : <p className="text-sm text-[var(--text-2)]">This saved observation has no displayable market values.</p>}
          {quotes.truncated && <p className="text-xs text-[var(--text-2)]">Only the first 1,500 saved values are shown.</p>}
        </>}
        {research && <details className="rounded-lg border border-[var(--border)] p-4"><summary className="cursor-pointer text-sm font-semibold">Saved research inputs · {research.observed_at}</summary>{researchDisplay ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">{researchDisplay}</pre> : <p className="mt-3 text-sm">This saved research snapshot is too large to display here.</p>}</details>}
        {!research && <p className="text-xs text-[var(--text-2)]">A saved pregame research snapshot is not available for this game.</p>}
      </>}
    </>}
  </div>
}
