import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HrGameIntelligenceWorkbench } from './HrGameIntelligenceWorkbench'

export const dynamic = 'force-dynamic'

export default async function HrGameIntelligencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/hr-intelligence')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')
  return <HrGameIntelligenceWorkbench />
}
