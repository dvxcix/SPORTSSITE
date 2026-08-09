import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Plus, ShieldCheck, Zap } from 'lucide-react'
import { getBlockedEitherWayIds } from '@/lib/blocks'
import { MessageInbox } from '@/components/social/MessageInbox'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  const blockedIds = new Set(await getBlockedEitherWayIds(supabase, user.id))

  // Get DM threads (distinct conversations)
  const { data: threads } = await supabase
    .from('messages')
    .select(`
      id, content, created_at,
      sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
      recipient:users!messages_dm_recipient_id_fkey(id, username, display_name, avatar_url)
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
      partner: {
        id: partner.id,
        username: partner.username,
        displayName: partner.display_name ?? null,
        avatarUrl: partner.avatar_url ?? null,
      },
    }
  })

  return (
    <div className="ss-messages-page">
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
