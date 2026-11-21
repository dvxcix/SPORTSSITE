import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FanduelImportForm } from './FanduelImportForm'

export const dynamic = 'force-dynamic'

export default async function FanduelImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/fanduel-import')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">FanDuel Gap Markets Import</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Admin-only. Fills markets our automated FanDuel feed doesn't carry: FHR, Laser 105+/110+, Moonshot, 1st Plate Appearance HR, HR/Moneyline Parlay, and Combine-for-HR (1 and 2+).
      </p>

      <details className="ss-admin-help bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6"><summary>Import instructions</summary>
        <ol className="text-sm text-[var(--text-2)] space-y-1 list-decimal list-inside">
          <li>Open the FanDuel event page for the game (sportsbook.fanduel.com)</li>
          <li>Open DevTools console, click a tab (Same Game Parlay, Batter Props, Plate Appearance, Lasers, etc.)</li>
          <li>Paste the scraper script — it appends to <code className="text-[var(--text-2)]">window.__fdAllScrapes</code></li>
          <li>Repeat for each tab that has FHR / Laser / Moonshot / 1st PA / HR-ML Parlay data</li>
          <li>Run <code className="text-[var(--text-2)]">copy(JSON.stringify(window.__fdAllScrapes, null, 2))</code>, paste below</li>
        </ol>
      </details>

      <FanduelImportForm />
    </div>
  )
}
