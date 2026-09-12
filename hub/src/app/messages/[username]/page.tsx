import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DMRoom, type DMMessage } from '@/components/chat/DMRoom'
import { isBlockedEitherWay } from '@/lib/blocks'

export const dynamic = 'force-dynamic'

export default async function DMPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  const { data: partner } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_ring_style, avatar_ring_color, is_verified, account_type')
    .eq('username', username)
    .single()

  if (!partner) redirect('/messages')
  if (partner.id === user.id) redirect(`/profile/${partner.username}`)

  if (await isBlockedEitherWay(supabase, user.id, partner.id)) {
    return (
      <div className="max-w-2xl mx-auto text-center py-24 px-4">
        <p className="text-4xl mb-3">🚫</p>
        <p className="text-white font-bold">You can't message this person</p>
        <p className="text-zinc-500 text-sm mt-1">You or @{partner.username} have blocked each other.</p>
      </div>
    )
  }

  const { data: history } = await supabase
    .from('messages')
    .select('id, content, created_at, sender_id, reply_to_id, media_urls, sender:users!messages_sender_id_fkey(username, display_name, avatar_url, avatar_ring_style, avatar_ring_color), reply_to:messages!messages_reply_to_id_fkey(id, content, sender_id)')
    .or(
      `and(sender_id.eq.${user.id},dm_recipient_id.eq.${partner.id}),and(sender_id.eq.${partner.id},dm_recipient_id.eq.${user.id})`
    )
    .not('dm_recipient_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(100)

  return <DMRoom partner={partner} currentUserId={user.id} initialMessages={(history ?? []) as unknown as DMMessage[]} />
}
