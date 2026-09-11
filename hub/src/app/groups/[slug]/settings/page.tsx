import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { GroupSettingsForm } from '@/components/groups/GroupSettingsForm'
import Link from 'next/link'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { CommunityNav } from '@/components/community/CommunityNav'

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
    <main className="ss-flow-page">
      <CommunityNav />
      <Link href={`/groups/${slug}`} className="ss-flow-back"><ArrowLeft size={15} /> {group.name}</Link>
      <header className="ss-flow-heading"><span><Settings2 size={19} /></span><div><p>Community controls</p><h1>Group settings</h1></div></header>
      <GroupSettingsForm group={group} />
    </main>
  )
}
