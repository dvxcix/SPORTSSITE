import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Plus } from 'lucide-react'
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
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <MessageCircle size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Messages</h1>
            <p className="text-xs text-zinc-500">Direct messages</p>
          </div>
        </div>
        <Link href="/messages/new"
          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
          <Plus size={14} /> New DM
        </Link>
      </div>

      <MessageInbox conversations={conversations} />
    </div>
  )
}
