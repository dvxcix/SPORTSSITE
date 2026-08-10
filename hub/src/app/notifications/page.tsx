import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bell, CheckCheck, Settings2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { NotificationsList, type NotifRow } from '@/components/social/NotificationsList'
import { TierGate } from '@/components/layout/TierGate'
import { getBlockedEitherWayIds } from '@/lib/blocks'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/notifications')

  const blockedIds = await getBlockedEitherWayIds(supabase, user.id)
  let notifQuery = supabase
    .from('notifications')
    .select('id, type, message, body, link, read, created_at, data, actor_id, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)
  if (blockedIds.length) notifQuery = notifQuery.not('actor_id', 'in', `(${blockedIds.join(',')})`)
  const { data: notifications } = await notifQuery
  const unreadCount = (notifications ?? []).filter(item => !item.read).length

  // Mark all as read
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)

  return (
    <TierGate requiredTier="basic" label="Notifications">
      <div className="mx-auto max-w-3xl px-3 pb-24 pt-4 sm:px-5 sm:pt-7">
        <div className="mb-5 overflow-hidden rounded-2xl border border-lime-400/20 bg-gradient-to-br from-lime-400/[0.09] via-zinc-950 to-zinc-950 p-4 shadow-2xl sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><Bell size={19} /></span><div><p className="text-[10px] font-black tracking-[0.18em] text-lime-300">ACTIVITY CENTER</p><h1 className="text-xl font-black text-white">Notifications</h1></div></div>
            <div className="flex items-center gap-2"><span className="rounded-full border border-zinc-800 bg-black/30 px-3 py-1.5 text-xs font-bold text-zinc-400">{unreadCount ? `${unreadCount} new` : 'All read'}</span><Link href="/settings/notifications" aria-label="Notification settings" className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-800 bg-black/30 text-zinc-400 hover:border-lime-400/30 hover:text-lime-300"><Settings2 size={15} /></Link></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-zinc-400"><span className="inline-flex items-center gap-1.5"><CheckCheck size={13} className="text-lime-300" /> Read status synced</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={13} className="text-lime-300" /> Blocked accounts filtered</span></div>
        </div>

        <NotificationsList userId={user.id} initialNotifications={(notifications as NotifRow[] | null) ?? []} />
      </div>
    </TierGate>
  )
}
