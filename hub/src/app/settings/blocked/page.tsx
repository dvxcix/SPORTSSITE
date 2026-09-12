import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BlockedUsersList } from '@/components/settings/BlockedUsersList'
import { SettingsShell } from '@/components/settings/SettingsShell'
import { MutedUsersList } from '@/components/settings/MutedUsersList'

export const dynamic = 'force-dynamic'

export default async function BlockedUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/blocked')

  const [{data:blocks},{data:suppressions}]=await Promise.all([
    supabase.from('blocks').select('blocked_id, created_at, blocked:users!blocks_blocked_id_fkey(id, username, display_name, avatar_url)').eq('blocker_id',user.id).order('created_at',{ascending:false}),
    supabase.from('feed_suppressions').select('target_id').eq('user_id',user.id).eq('target_type','author'),
  ])

  const blocked = (blocks ?? [])
    .map((b: any) => ({ ...b.blocked, blocked_at: b.created_at }))
    .filter(Boolean)
  const mutedIds=(suppressions??[]).map(row=>row.target_id)
  const {data:muted}=mutedIds.length?await supabase.from('users').select('id,username,display_name,avatar_url').in('id',mutedIds):{data:[]}

  return (
    <SettingsShell active="/settings/blocked" title="Muted and blocked" description="Control which accounts can reach you and which voices appear in your feed.">
      <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-500">Muted accounts</h2>
      <MutedUsersList currentUserId={user.id} initialMuted={muted??[]} />
      <h2 className="mb-2 mt-6 text-xs font-black uppercase tracking-wider text-zinc-500">Blocked accounts</h2>
      <BlockedUsersList currentUserId={user.id} initialBlocked={blocked} />
    </SettingsShell>
  )
}
