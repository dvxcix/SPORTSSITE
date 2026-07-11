import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GroupSettingsForm } from '@/components/groups/GroupSettingsForm'

export const dynamic = 'force-dynamic'

export default async function GroupSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?next=/groups/${slug}/settings`)

  const { data: group } = await supabase.from('groups').select('*').eq('slug', slug).single()
  if (!group) notFound()

  const { data: member } = await supabase
    .from('group_members')
    .select('role')
    .eq('group_id', group.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (member?.role !== 'owner') redirect(`/groups/${slug}`)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-6">Group Settings</h1>
      <GroupSettingsForm group={group} />
    </div>
  )
}
