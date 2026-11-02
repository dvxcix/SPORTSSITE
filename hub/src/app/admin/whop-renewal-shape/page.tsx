import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RenewalShapeForm from './RenewalShapeForm'

export const dynamic = 'force-dynamic'

export default async function RenewalShapePage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) redirect('/auth/login?next=/admin/whop-renewal-shape')
  const [{ data: profile, error: profileError }, { data: assurance, error: assuranceError }] = await Promise.all([
    supabase.from('users').select('account_type').eq('id', user.id).maybeSingle(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (profileError || profile?.account_type !== 'admin') redirect('/')
  if (assuranceError || assurance?.currentLevel !== 'aal2') redirect('/settings/security?next=/admin/whop-renewal-shape')
  return <RenewalShapeForm />
}
