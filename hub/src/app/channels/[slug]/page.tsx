import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getChannelMessages } from '@/lib/queries'
import { ChatRoom } from '@/components/chat/ChatRoom'

interface Props { params: Promise<{ slug: string }> }

export default async function ChannelPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: channel } = await supabase
    .from('channels')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!channel) notFound()

  const messages = await getChannelMessages(channel.id, 50)
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="flex flex-col h-screen">
      {/* Channel header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center gap-3 bg-zinc-950 shrink-0">
        <span className="text-2xl">{channel.icon}</span>
        <div>
          <h1 className="font-bold text-white">{channel.name}</h1>
          {channel.description && <p className="text-xs text-zinc-500">{channel.description}</p>}
        </div>
        <div className="ml-auto text-xs text-zinc-600">{channel.member_count} members</div>
      </div>

      <ChatRoom
        channelId={channel.id}
        channelName={channel.name}
        initialMessages={messages}
        currentUserId={user?.id}
      />
    </div>
  )
}
