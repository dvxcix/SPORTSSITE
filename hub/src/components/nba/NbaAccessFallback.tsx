import Link from 'next/link'
import { redirect } from 'next/navigation'
import { TierUpsell } from '@/components/layout/TierUpsell'

export function NbaAccessFallback({ status }: { status: number }) {
  if (status === 401) redirect('/auth/login?next=%2Fthe-paint')
  if (status === 403) return <TierUpsell requiredTier="ultimate" label="NBA research" />
  return <section className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-lg font-bold">NBA access is temporarily unavailable</h1>
    <p className="text-sm text-[var(--text-2)]">Your membership could not be checked. Please try again.</p>
    <Link href="/the-paint" className="rounded-xl bg-[var(--accent-fill)] px-5 py-3 font-semibold text-[var(--accent-fg)]">Try again</Link>
  </section>
}
