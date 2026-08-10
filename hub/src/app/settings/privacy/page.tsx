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
        className="flex items-center gap-4 px-4 py-3.5 mt-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors group">
        <div className="p-2 rounded-lg bg-zinc-800 group-hover:bg-zinc-700 transition-colors">
          <UserX size={16} className="text-zinc-400" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-sm text-white">Blocked Users</p>
          <p className="text-xs text-zinc-500">Manage who you've blocked</p>
        </div>
        <ChevronRight size={16} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
      </Link>
  </SettingsShell>
}
