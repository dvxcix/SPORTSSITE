import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BlockedUsersList } from '@/components/settings/BlockedUsersList'

export const dynamic = 'force-dynamic'

export default async function BlockedUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/settings/blocked')

  const { data: blocks } = await supabase
    .from('blocks')
    .select('blocked_id, created_at, blocked:users!blocks_blocked_id_fkey(id, username, display_name, avatar_url)')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false })

  const blocked = (blocks ?? [])
    .map((b: any) => ({ ...b.blocked, blocked_at: b.created_at }))
    .filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-xl font-black text-white mb-1">Blocked Users</h1>
      <p className="text-sm text-zinc-500 mb-6">
        Blocked accounts can't see your posts, profile, or send you messages — and you won't see theirs either.
      </p>
      <BlockedUsersList currentUserId={user.id} initialBlocked={blocked} />
    </div>
  )
}
