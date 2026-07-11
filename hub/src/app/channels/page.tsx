import { getChannels } from '@/lib/queries'
import Link from 'next/link'
import { MessageSquare, Users, Pin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const revalidate = 60

export default async function ChannelsPage() {
  const channels = await getChannels()
  const pinned = channels.filter(c => c.is_pinned)
  const rest = channels.filter(c => !c.is_pinned)

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-zinc-800 rounded-lg">
          <MessageSquare size={20} className="text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">Channels</h1>
          <p className="text-sm text-zinc-500">Join the conversation</p>
        </div>
      </div>

      {pinned.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Pin size={12} /> Featured
          </h2>
          <div className="space-y-2">
            {pinned.map(ch => <ChannelRow key={ch.id} channel={ch} />)}
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">All Channels</h2>
          <div className="space-y-2">
            {rest.map(ch => <ChannelRow key={ch.id} channel={ch} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function ChannelRow({ channel }: { channel: Awaited<ReturnType<typeof getChannels>>[0] }) {
  return (
    <Link href={`/channels/${channel.slug}`}>
      <div className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-600 transition-all group">
        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
          {channel.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">{channel.name}</span>
            {channel.sport && <Badge>{channel.sport}</Badge>}
            {channel.channel_type !== 'public' && (
              <Badge variant="pick">{channel.channel_type === 'vip' ? 'VIP' : 'Members'}</Badge>
            )}
          </div>
          {channel.description && (
            <p className="text-sm text-zinc-500 mt-0.5 truncate">{channel.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-600 shrink-0">
          <span className="flex items-center gap-1"><Users size={12} />{channel.member_count}</span>
          <span className="text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">Join →</span>
        </div>
      </div>
    </Link>
  )
}
