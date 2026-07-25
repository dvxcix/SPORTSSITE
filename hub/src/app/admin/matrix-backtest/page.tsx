import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MatrixBacktestForm } from './MatrixBacktestForm'

export const dynamic = 'force-dynamic'

export default async function MatrixBacktestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/matrix-backtest')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Matrix Pipeline Backtest</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Admin-only. Runs a saved Matrix (classic or pipeline) against real completed slates — reconstructs the exact odds/season-average/pick-count inputs it would have seen, runs the real matching engine, and grades the result against real box score home runs.
      </p>
      <MatrixBacktestForm />
    </div>
  )
}
