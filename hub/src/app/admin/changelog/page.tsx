import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangelogManager } from './ChangelogManager'
import type { ChangelogEntry } from '@/lib/changelog'

export const dynamic = 'force-dynamic'

export default async function AdminChangelogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/changelog')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const { data: entries } = await supabase
    .from('changelog_entries')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Changelog</h1>
      <p className="text-sm text-[var(--text-3)] mb-6">
        Publish updates to What's new. Active entries appear when members next visit; dismissals sync across devices.
      </p>
      <ChangelogManager initialEntries={(entries ?? []) as ChangelogEntry[]} />
    </div>
  )
}
