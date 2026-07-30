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
      <h1 className="text-xl font-black text-white mb-1">What's New / Changelog</h1>
      <p className="text-sm text-zinc-500 mb-6">
        When a big feature ships, add an entry here and turn it on — every signed-in member sees it as a popup the
        next time they load the site, once, until they dismiss it (permanently, on every device — not just for this
        browser session). Multiple active entries can queue up; a member sees each one they haven't dismissed yet.
      </p>
      <ChangelogManager initialEntries={(entries ?? []) as ChangelogEntry[]} />
    </div>
  )
}
