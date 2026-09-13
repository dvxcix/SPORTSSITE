import { redirect } from 'next/navigation'
import { ConnectedAccountsPanel } from '@/components/settings/ConnectedAccountsPanel'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { VerifiedIdentity } from '@/lib/verifiedIdentity'

export default async function ConnectedAccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/connections')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('users')
    .select('verified_identities, whop_user_id')
    .eq('id', user.id)
    .maybeSingle()

  return (
    <SettingsShell
      active="/settings/connections"
      eyebrow="ACCOUNT CONNECTIONS"
      title="Connect your accounts"
      description="Link Whop, Discord, and X to the SlipSurge account you already use."
    >
      <ConnectedAccountsPanel
        initialVerified={(profile?.verified_identities as Record<string, VerifiedIdentity> | null) ?? {}}
        initialWhopConnected={!!profile?.whop_user_id}
      />
    </SettingsShell>
  )
}
