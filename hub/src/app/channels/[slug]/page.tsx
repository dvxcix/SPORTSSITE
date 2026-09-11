import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getChannelMessages, getChannels } from '@/lib/queries'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { CommunityNav } from '@/components/community/CommunityNav'
import Link from 'next/link'
import { Hash, Menu, Users } from 'lucide-react'

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
  const channels = await getChannels()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="ss-community-room-layout">
      <aside className="ss-desktop-channel-rail">
        <div className="ss-desktop-channel-brand"><img src="/logo.png" alt="" /><div><strong>Community</strong><span>SLIPSURGE</span></div></div>
        <CommunityNav />
        <nav>
          {channels.map(item => (
            <Link key={item.id} href={`/channels/${item.slug}`} data-active={item.slug === slug}>
              <span>{item.icon}</span><div><strong>{item.name}</strong><small>{item.member_count} members</small></div>
            </Link>
          ))}
        </nav>
      </aside>
      <section className="ss-community-room">
      <header className="ss-channel-header">
        <Link href="/channels" className="ss-channel-menu" aria-label="All channels"><Menu size={18}/></Link>
        <span className="ss-channel-icon">{channel.icon || <Hash size={18}/>}</span>
        <div>
          <h1>{channel.name}</h1>
          {channel.description && <p>{channel.description}</p>}
        </div>
        <div className="ss-channel-members"><Users size={14}/><span>{channel.member_count}</span></div>
      </header>

      <ChatRoom
        key={channel.id}
        channelId={channel.id}
        channelName={channel.name}
        initialMessages={messages}
        currentUserId={user?.id}
      />
      </section>
    </div>
  )
}
