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
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Matrix Pipeline Backtest</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Test a saved Matrix against completed slates using its original odds, season averages and pick counts. Results are graded against recorded home runs.
      </p>
      <MatrixBacktestForm />
    </div>
  )
}
