import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PikkitImportForm } from './PikkitImportForm'

export const dynamic = 'force-dynamic'

export default async function PikkitImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/pikkit-import')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Pikkit Picks Import</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Admin-only. Feeds the community pick counts behind the 💰SA÷RBI value flag in The Dugout.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">How to get the data</p>
        <ol className="text-sm text-zinc-400 space-y-1 list-decimal list-inside">
          <li>Sign into app.pikkit.com, open the game's props page</li>
          <li>Run your bookmarklet script in the browser console</li>
          <li>Copy the full JSON line it logs after "PIKKIT DONE"</li>
          <li>Paste it below, set the game date, and import</li>
        </ol>
      </div>

      <PikkitImportForm />
    </div>
  )
}
