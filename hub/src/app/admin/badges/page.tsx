import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BadgeManager } from './BadgeManager'

export const dynamic = 'force-dynamic'

export default async function AdminBadgesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/admin/badges')
  const { data: profile } = await supabase.from('users').select('account_type').eq('id', user.id).single()
  if (profile?.account_type !== 'admin') redirect('/')

  const [{ data: badges }, { data: assignments }] = await Promise.all([
    supabase.from('badges').select('*').order('created_at', { ascending: false }),
    // user_badges has two FKs to users (user_id and awarded_by) — the
    // embed name has to be qualified with !user_badges_user_id_fkey or
    // PostgREST can't tell which relationship "user:users(...)" means.
    supabase.from('user_badges').select('badge_id, user:users!user_badges_user_id_fkey(id, username, display_name, avatar_url)'),
  ])

  return (
    <div className="ss-admin-badges-page">
      <h1>Badge studio</h1>
      <p className="ss-admin-badges-intro">
        Create a badge (icon + name + what it means), then assign it to whichever members earned it — like assigning
        a role on Discord. It shows next to their name on posts, comments, their profile, the leaderboard, and search,
        and hovering it shows the description you set here.
      </p>
      <BadgeManager userId={user.id} initialBadges={badges ?? []} initialAssignments={(assignments ?? []) as any} />
    </div>
  )
}
