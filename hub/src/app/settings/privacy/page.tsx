import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { UserX, ChevronRight } from 'lucide-react'
import { PrivacySettingsForm } from '@/components/settings/PrivacySettingsForm'
import { SettingsShell } from '@/components/settings/SettingsShell'

export default async function PrivacySettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/privacy')
  const { data: profile } = await supabase.from('users').select('is_private, allow_dms, hide_win_rate').eq('id', user.id).single()
  return <SettingsShell active="/settings/privacy" title="Privacy and visibility" description="Control who can view your activity, contact you, and see performance details.">
      <PrivacySettingsForm settings={{ is_private: profile?.is_private ?? false, allow_dms: profile?.allow_dms ?? true, hide_win_rate: profile?.hide_win_rate ?? false }} />
      <Link href="/settings/blocked"
        className="ss-settings-card group mt-4 flex items-center gap-4 !p-4 transition hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)]">
        <div className="rounded-xl border border-[rgba(var(--line-rgb),0.07)] bg-[var(--surface)] p-2.5 transition-colors group-hover:bg-[rgba(var(--contrast-rgb),0.05)]">
          <UserX size={16} className="text-[var(--text-2)]" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm text-[var(--text-1)]">Blocked Users</p>
          <p className="text-xs text-[var(--text-3)]">Manage who you've blocked</p>
        </div>
        <ChevronRight size={16} className="text-[var(--text-3)] group-hover:text-[var(--text-2)] transition-colors" />
      </Link>
  </SettingsShell>
}
