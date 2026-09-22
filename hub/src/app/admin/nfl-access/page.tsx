import { NflAccessManager } from './NflAccessManager'

export const dynamic = 'force-dynamic'
export default function NflAccessPage() {
  return <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
    <header>
      <p className="text-xs font-bold uppercase tracking-widest text-[var(--accent)]">Private beta</p>
      <h1 className="mt-2 text-2xl font-black text-[var(--text-1)]">NFL early access</h1>
      <p className="mt-2 max-w-2xl text-sm text-[var(--text-2)]">Choose who can test The Sideline, NFL Cheatsheets, Public, Sportsbooks, Matchup Lab and NFL Matrices. No admin access. No changes to their membership or MLB tools.</p>
    </header>
    <NflAccessManager />
  </main>
}
