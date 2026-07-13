import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bell } from 'lucide-react'
import { NotificationsList } from '@/components/social/NotificationsList'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/notifications')

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, type, message, body, link, read, created_at, data, actor:users!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // Mark all as read
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: 8, background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <Bell size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)' }}>Notifications</h1>
      </div>

      <NotificationsList userId={user.id} initialNotifications={(notifications as any) ?? []} />
    </div>
  )
}
