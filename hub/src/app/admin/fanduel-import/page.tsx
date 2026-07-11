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
      <h1 className="text-xl font-black text-white mb-1">FanDuel Gap Markets Import</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Admin-only. Fills markets our automated FanDuel feed doesn't carry: FHR, Laser 105+/110+, Moonshot, 1st Plate Appearance HR, HR/Moneyline Parlay, and Combine-for-HR (1 and 2+).
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">How to get the data</p>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open the FanDuel event page for the game (sportsbook.fanduel.com)</li>
          <li>Open DevTools console, click a tab (Same Game Parlay, Batter Props, Plate Appearance, Lasers, etc.)</li>
          <li>Paste the scraper script — it appends to <code className="text-zinc-300">window.__fdAllScrapes</code></li>
          <li>Repeat for each tab that has FHR / Laser / Moonshot / 1st PA / HR-ML Parlay data</li>
          <li>Run <code className="text-zinc-300">copy(JSON.stringify(window.__fdAllScrapes, null, 2))</code>, paste below</li>
        </ol>
      </div>

      <FanduelImportForm />
    </div>
  )
}
