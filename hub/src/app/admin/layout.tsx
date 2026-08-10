import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminShell } from '@/components/admin/AdminShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin')

  const [{ data: profile }, { data: assurance }] = await Promise.all([
    supabase.from('users').select('account_type').eq('id', user.id).single(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (profile?.account_type !== 'admin') redirect('/')
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') redirect('/settings/security?next=/admin')

  return <AdminShell email={user.email ?? 'Administrator'}>{children}</AdminShell>
}
