import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Bell, Settings2 } from 'lucide-react'
import { NotificationsList, type NotifRow } from '@/components/social/NotificationsList'
import { TierGate } from '@/components/layout/TierGate'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell } from '@/components/product/ProductPage'

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
  return (
    <TierGate requiredTier="basic" label="Notifications">
      <ProductPageShell narrow>
        <CommunityNav />
        <ProductHero icon={<Bell size={20}/>} eyebrow="Your activity" title="Notifications" description="Everything that needs your attention in one place." actions={<ProductAction href="/settings/notifications"><Settings2 size={15}/> Settings</ProductAction>}/>

        <NotificationsList userId={user.id} initialNotifications={(notifications as NotifRow[] | null) ?? []} />
      </ProductPageShell>
    </TierGate>
  )
}
