import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MgmImportForm } from './MgmImportForm'

export const dynamic = 'force-dynamic'

export default async function MgmImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/mgm-import')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">BetMGM Home Run Import</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Admin-only. Backs up/fills anytime-HR (1+) and 2+ HR odds for BetMGM when BDL coverage is sparse.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">How to get the data</p>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Open the BetMGM event page (nc.betmgm.com), scroll to and click "Batter home runs" to expand it</li>
          <li>Open DevTools console, paste the scraper script — it appends to <code className="text-zinc-300">window.__mgmAllScrapes</code></li>
          <li>Click the "2+" threshold tab and run the scraper again to capture that too (optional)</li>
          <li>Run <code className="text-zinc-300">copy(JSON.stringify(window.__mgmAllScrapes, null, 2))</code>, paste below</li>
        </ol>
      </div>

      <MgmImportForm />
    </div>
  )
}
