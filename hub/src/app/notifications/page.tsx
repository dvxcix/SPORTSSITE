import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bell, Heart, MessageCircle, UserPlus, AtSign, Trophy, Zap, Repeat2, Users } from 'lucide-react'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const iconMap: Record<string, any> = {
  reaction: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
  pick_result: Trophy,
  dm: MessageCircle,
  subscription: Zap,
  repost: Repeat2,
  group_invite: Users,
}

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/notifications')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Mark all as read
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)

  const groups: Record<string, any[]> = {}
  ;(notifications ?? []).forEach((n: any) => {
    const date = new Date(n.created_at)
    const today = new Date()
    const diff = Math.floor((today.getTime() - date.getTime()) / 86400000)
    const key = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This Week' : 'Earlier'
    groups[key] = [...(groups[key] ?? []), n]
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-800 rounded-lg"><Bell size={20} className="text-yellow-400" /></div>
        <h1 className="text-xl font-black text-white">Notifications</h1>
      </div>

      {(notifications?.length ?? 0) === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">🔔</p>
          <p className="text-zinc-400 font-medium">You're all caught up</p>
          <p className="text-xs text-zinc-600 mt-1">Notifications will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([label, items]) => (
            <div key={label}>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">{label}</p>
              <div className="space-y-1">
                {items.map((n: any) => {
                  const Icon = iconMap[n.type] ?? Bell
                  const hasActor = !!(n.actor?.display_name || n.actor?.username)
                  const content = (
                    <>
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden">
                          {(n.actor?.avatar_url || n.data?.avatar_url) && (
                            <img src={n.actor?.avatar_url || n.data?.avatar_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center">
                          <Icon size={10} className="text-green-400" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 leading-snug">
                          {hasActor && <span className="font-bold text-white">{n.actor.display_name || n.actor.username}{' '}</span>}
                          {n.message || n.body || 'interacted with you'}
                        </p>
                        <p className="text-xs text-zinc-600 mt-0.5">
                          {new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.read && <div className="w-2 h-2 bg-green-400 rounded-full mt-2 shrink-0" />}
                    </>
                  )
                  const className = `flex items-start gap-3 p-3 rounded-xl transition-colors ${n.read ? 'bg-transparent hover:bg-zinc-900' : 'bg-zinc-900/60 border border-zinc-800'}`
                  return n.link ? (
                    <Link key={n.id} href={n.link} className={className}>{content}</Link>
                  ) : (
                    <div key={n.id} className={className}>{content}</div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
