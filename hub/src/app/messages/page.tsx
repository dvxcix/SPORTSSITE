import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Plus, ShieldCheck, Zap } from 'lucide-react'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { MessageInbox } from '@/components/social/MessageInbox'
import { CommunityNav } from '@/components/community/CommunityNav'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  const [blockedIdList, unreadResult] = await Promise.all([
    getBlockedEitherWayIds(supabase, user.id),
    supabase.from('notifications').select('actor_id').eq('user_id', user.id).eq('type', 'message').eq('read', false),
  ])
  const blockedIds = new Set(blockedIdList)
  const unreadByPartner = new Map<string, number>()
  for (const notification of unreadResult.data ?? []) {
    if (notification.actor_id) unreadByPartner.set(notification.actor_id, (unreadByPartner.get(notification.actor_id) ?? 0) + 1)
  }

  // Get DM threads (distinct conversations)
  const { data: threads } = await supabase
    .from('messages')
    .select(`
      id, content, created_at,
      sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color),
      recipient:users!messages_dm_recipient_id_fkey(id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color)
    `)
    .or(`sender_id.eq.${user.id},dm_recipient_id.eq.${user.id}`)
    .not('dm_recipient_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  // Deduplicate by conversation partner
  const seen = new Set<string>()
  const convos: any[] = []
  for (const m of threads ?? []) {
    const partner = (m.sender as any)?.id === user.id ? m.recipient : m.sender
    const pid = (partner as any)?.id
    if (pid && !seen.has(pid) && !blockedIds.has(pid)) {
      seen.add(pid)
      convos.push({ ...m, partner })
    }
  }

  const conversations = convos.map(conversation => {
    const partner = conversation.partner as any
    return {
      id: partner.id,
      content: conversation.content ?? '',
      createdAt: conversation.created_at,
      unreadCount: unreadByPartner.get(partner.id) ?? 0,
      lastIsMine: conversation.sender?.id === user.id,
      partner: {
        id: partner.id,
        username: partner.username,
        displayName: partner.display_name ?? null,
        avatarUrl: partner.avatar_url ?? null,
        avatarRingStyle: partner.avatar_ring_style ?? null,
        avatarRingColor: partner.avatar_ring_color ?? null,
      },
    }
  })

  return (
    <div className="ss-messages-page">
      <CommunityNav />
      <section className="ss-messages-hero">
        <div className="ss-messages-hero-copy">
          <div className="ss-messages-hero-icon">
            <MessageCircle size={21} />
          </div>
          <div>
            <span className="ss-eyebrow"><Zap size={10} /> Member network</span>
            <h1>Messages</h1>
            <p>Private conversations with the people you follow across SlipSurge.</p>
          </div>
        </div>
        <Link href="/messages/new"
          className="ss-messages-new-button">
          <Plus size={15} /> New message
        </Link>
      </section>

      <section className="ss-messages-inbox-shell">
        <div className="ss-messages-section-heading">
          <div><strong>Inbox</strong><span>{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</span></div>
          <span><ShieldCheck size={12} /> Private</span>
        </div>
        <MessageInbox conversations={conversations} />
      </section>
    </div>
  )
}
