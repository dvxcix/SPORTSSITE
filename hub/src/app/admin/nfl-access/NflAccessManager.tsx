'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { Check, LoaderCircle, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'

type Member = { id: string; username: string; display_name: string | null; avatar_url: string | null; granted?: boolean }
type Grant = { user_id: string; granted_at: string; member: Member }
async function fetchJson(url: string) {
  const response = await fetch(url, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Could not load access')
  return data
}

function MemberIdentity({ member }: { member: Member }) {
  return <div className="flex min-w-0 items-center gap-3">
    <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-3)] text-sm font-bold">
      {member.avatar_url ? <SafeImage src={member.avatar_url} alt="" className="size-full object-cover" /> : member.username.slice(0, 1).toUpperCase()}
    </div>
    <div className="min-w-0 break-words">
      <p className="text-sm font-bold text-[var(--text-1)]">{member.display_name || member.username}</p>
      <p className="text-xs text-[var(--text-2)]">@{member.username}</p>
    </div>
  </div>
}

export function NflAccessManager() {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [mutationError, setMutationError] = useState('')
  const { data, error, isLoading, mutate } = useSWR<{ grants: Grant[]; count: number }>(`/api/admin/nfl-access?page=${page}`, fetchJson)
  const search = query.trim().replace(/^@/, '')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const { data: matches, error: searchError, isLoading: searching, mutate: refreshMatches } = useSWR<{ users: Member[] }>(
    debouncedQuery.length >= 2 ? `/api/admin/nfl-access?q=${encodeURIComponent(debouncedQuery)}` : null, fetchJson,
    { keepPreviousData: false, dedupingInterval: 500 })

  async function change(member: Member, granted: boolean) {
    setPending(member.id); setMutationError(''); setNotice('')
    try {
      const response = await fetch('/api/admin/nfl-access', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.id, granted }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not update access')
      setNotice(`@${member.username}: NFL access ${granted ? 'granted' : 'revoked'}.`)
      await Promise.all([mutate(), refreshMatches()])
      if (!granted && data?.grants.length === 1 && page > 0) setPage(page - 1)
    } catch (cause) { setMutationError(cause instanceof Error ? cause.message : 'Could not update access') }
    finally { setPending(null) }
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
      <label htmlFor="nfl-member-search" className="mb-3 block text-sm font-bold">Add a tester</label>
      <div className="relative">
        <Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-[var(--text-3)]" />
        <input id="nfl-member-search" type="search" autoComplete="off" value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search @username or name" aria-describedby="nfl-search-hint"
          className="ss-input min-h-11 w-full rounded-xl pl-10 pr-3 text-sm" />
      </div>
      <p id="nfl-search-hint" className="mt-2 text-xs text-[var(--text-3)]">Type at least 2 characters. Administrators already have access.</p>
      {search.length >= 2 && <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-[var(--border)]" aria-label="Matching members">
        {searching || search !== debouncedQuery ? <p role="status" className="p-4 text-sm">Searching members…</p>
          : searchError ? <p role="alert" className="p-4 text-sm text-red-400">{searchError.message}</p>
          : !matches?.users.length ? <p className="p-4 text-sm text-[var(--text-2)]">No matching members.</p>
          : matches.users.map(member => <div key={member.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-3 last:border-0">
            <MemberIdentity member={member} />
            <button type="button" disabled={pending !== null || member.granted} onClick={() => change(member, true)}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent)] px-3 text-xs font-bold text-black disabled:opacity-50"
              aria-label={member.granted ? `@${member.username} already has access` : `Grant NFL access to @${member.username}`}>
              {pending === member.id ? <LoaderCircle size={15} className="animate-spin" /> : member.granted ? <Check size={15} /> : <UserPlus size={15} />}
              {member.granted ? 'Added' : 'Grant access'}
            </button>
          </div>)}
      </div>}
    </section>
    {notice && <p role="status" className="rounded-xl bg-[var(--accent-dim)] p-3 text-sm text-[var(--accent)]">{notice}</p>}
    {mutationError && <p role="alert" className="rounded-xl border border-red-500/30 p-3 text-sm text-red-400">{mutationError}</p>}
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-bold">Approved testers</h2>
        <span className="rounded-full bg-[var(--accent-dim)] px-3 py-1 text-xs text-[var(--accent)]">{data?.count ?? '—'}</span>
      </header>
      {isLoading ? <p role="status" className="p-5 text-sm">Loading testers…</p>
        : error ? <div role="alert" className="p-5"><p className="text-sm text-red-400">{error.message}</p><button className="mt-2 min-h-11 text-sm underline" onClick={() => mutate()}>Retry</button></div>
        : !data?.grants.length ? <div className="space-y-2 p-8 text-center text-[var(--text-2)]"><ShieldCheck size={26} className="mx-auto" /><p className="text-sm font-semibold">No testers added yet</p><p className="text-xs">Search for a member above to grant NFL-only access.</p></div>
        : <ul>{data.grants.map(grant => <li key={grant.user_id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4 last:border-0">
          <div className="min-w-0"><MemberIdentity member={grant.member} /><p className="mt-2 pl-[52px] text-xs text-[var(--text-3)]">Added {new Date(grant.granted_at).toLocaleDateString()}</p></div>
          <button type="button" disabled={pending !== null} onClick={() => change(grant.member, false)}
            aria-label={`Revoke NFL access for @${grant.member.username}`}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] px-3 text-xs font-bold text-[var(--text-2)] hover:border-red-400 hover:text-red-400 disabled:opacity-50">
            {pending === grant.user_id ? <LoaderCircle size={15} className="animate-spin" /> : <X size={15} />}Revoke
          </button>
        </li>)}</ul>}
      {(data?.count ?? 0) > 50 && <div className="flex items-center justify-between p-4 text-sm">
        <button className="min-h-11 disabled:opacity-40" disabled={page === 0 || pending !== null} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page + 1} of {Math.ceil((data?.count ?? 0) / 50)}</span>
        <button className="min-h-11 disabled:opacity-40" disabled={(page + 1) * 50 >= (data?.count ?? 0) || pending !== null} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </section>
    <p className="text-xs leading-relaxed text-[var(--text-3)]">Revoking blocks new NFL requests immediately. Open NFL pages and navigation recheck within 30 seconds while active. Previously downloaded information cannot be recalled. All changes are recorded in the admin audit log.</p>
  </div>
}
