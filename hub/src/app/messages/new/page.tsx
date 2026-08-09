import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { NewDMForm } from '@/components/chat/NewDMForm'
import { getBlockedEitherWayIds } from '@/lib/blocks'

export default async function NewDMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages/new')

  const blockedIds = await getBlockedEitherWayIds(supabase, user.id)
  let usersQuery = supabase
    .from('users')
    .select('id, username, display_name, avatar_url, is_verified')
    .neq('id', user.id)
    .order('follower_count', { ascending: false })
    .limit(50)
  if (blockedIds.length) usersQuery = usersQuery.not('id', 'in', `(${blockedIds.join(',')})`)
  const { data: users } = await usersQuery

  return (
    <div className="ss-new-message-page">
      <div className="ss-new-message-heading"><span>New conversation</span><h1>Who do you want to message?</h1><p>Search members by display name or username.</p></div>
      <div className="ss-new-message-shell"><NewDMForm users={users ?? []} /></div>
    </div>
  )
}
