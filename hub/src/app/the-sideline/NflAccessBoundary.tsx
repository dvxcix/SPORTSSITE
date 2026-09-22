'use client'

import { useNflAccess } from '@/lib/useNflAccess'

export function NflAccessBoundary({ children }: { children: React.ReactNode }) {
  const { allowed, loading, error } = useNflAccess()
  if (loading) return <p className="p-6 text-sm text-[var(--text-2)]">Checking NFL access…</p>
  if (!allowed) return <section className="m-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" role="status">
    <h1 className="text-xl font-bold">{error ? 'NFL access check unavailable' : 'NFL early access required'}</h1>
    <p className="mt-2 text-sm text-[var(--text-2)]">{error ? 'Please refresh and try again.' : 'Your account does not currently have NFL beta access. Your other SlipSurge access is unchanged.'}</p>
  </section>
  return children
}
