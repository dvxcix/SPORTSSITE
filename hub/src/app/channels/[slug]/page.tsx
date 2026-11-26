import { SlipSurgeLogo } from '@/components/brand/SlipSurgeLogo'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { getChannelMessages, getChannels } from '@/lib/queries'
import { TierGate } from '@/components/layout/TierGate'
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
  if(channel.group_id){
    const {data:group,error}=await supabase.from('groups').select('slug').eq('id',channel.group_id).maybeSingle()
    if(error)throw new Error('Community access could not be verified. Try again.')
    if(!group)notFound()
    redirect(`/groups/${encodeURIComponent(group.slug)}?view=chat&channel=${encodeURIComponent(channel.slug)}`)
  }

  const [messages, channels, { data: { user } }] = await Promise.all([
    getChannelMessages(channel.id, 80),
    getChannels(),
    supabase.auth.getUser(),
  ])
  const { data: permissions, error: permissionError } = user
    ? await supabase.rpc('get_my_channel_permissions', { p_channel_id: channel.id })
    : { data: null, error: null }
  if (permissionError) throw new Error('Channel permissions could not be loaded. Try again.')

  const room = (
    <div className="ss-community-room-layout">
      <aside className="ss-desktop-channel-rail">
        <div className="ss-desktop-channel-brand"><div><SlipSurgeLogo width={130} decorative priority/><strong>Community</strong></div></div>
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
        canModerate={Boolean(permissions?.moderate)}
        readOnly={Boolean(user) && !permissions?.send}
      />
      </section>
    </div>
  )
  return <TierGate requiredTier="basic" label="Live rooms">{room}</TierGate>
}
