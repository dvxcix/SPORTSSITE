import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getChannelMessages, getChannels } from '@/lib/queries'
import { ChatRoom } from '@/components/chat/ChatRoom'
import { CommunityNav } from '@/components/community/CommunityNav'
import Link from 'next/link'
import Image from 'next/image'
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

  const [messages, channels, { data: { user } }] = await Promise.all([
    getChannelMessages(channel.id, 80),
    getChannels(),
    supabase.auth.getUser(),
  ])

  return (
    <div className="ss-community-room-layout">
      <aside className="ss-desktop-channel-rail">
        <div className="ss-desktop-channel-brand"><Image src="/logo.png" alt="" width={30} height={30} priority /><div><strong>Community</strong><span>SLIPSURGE</span></div></div>
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
        <div className="ss-channel-members"><Users size={14}/><span>{channel.member_count ?? 0}</span></div>
      </header>

      <ChatRoom
        key={channel.id}
        channelId={channel.id}
        channelSlug={channel.slug}
        channelName={channel.name}
        initialMessages={messages}
        currentUserId={user?.id}
        canModerate={channel.owner_id === user?.id}
      />
      </section>
    </div>
  )
}
