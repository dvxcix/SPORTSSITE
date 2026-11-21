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
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Pikkit Picks Import</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Admin-only. Feeds the community pick counts behind the 💰SA÷RBI value flag in The Dugout.
      </p>

      <details className="ss-admin-help bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-6"><summary>Import instructions</summary>
        <ol className="text-sm text-[var(--text-2)] space-y-1 list-decimal list-inside">
          <li>Sign into app.pikkit.com, open the game's props page</li>
          <li>Run your bookmarklet script in the browser console</li>
          <li>Copy the full JSON line it logs after "PIKKIT DONE"</li>
          <li>Paste it below, set the game date, and import</li>
        </ol>
      </details>

      <PikkitImportForm />
    </div>
  )
}
