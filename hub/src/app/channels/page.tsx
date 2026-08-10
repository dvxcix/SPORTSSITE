import { createClient } from '@/lib/supabase/server'
import { hasCreatorAccess } from '@/lib/creator'
import Link from 'next/link'
import { ArrowRight, Hash, LockKeyhole, MessageSquareText, Plus, Radio, Users } from 'lucide-react'

type ChannelCardData = { id: string; slug: string; name: string; description?: string | null; icon?: string | null; channel_type?: string | null; member_count?: number | null }

export const dynamic = 'force-dynamic'

export default async function ChannelsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: approval }, { data: channels }] = await Promise.all([
    user ? supabase.from('users').select('account_type').eq('id', user.id).single() : Promise.resolve({ data: null }),
    user ? supabase.from('creator_applications').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('channels').select('*').order('is_pinned', { ascending: false }).order('member_count', { ascending: false }),
  ])
  const creator = hasCreatorAccess(profile?.account_type, Boolean(approval))
  const owned = (channels ?? []).filter(channel => channel.owner_id === user?.id)
  const community = (channels ?? []).filter(channel => channel.owner_id !== user?.id)

  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
    <header className="flex flex-col gap-5 rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,.14),transparent_35%),#0c0f0d] p-6 sm:flex-row sm:items-end sm:justify-between sm:p-9"><div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-lime-300"><Radio size={14}/> Live community</p><h1 className="mt-2 text-3xl font-black text-white sm:text-5xl">Channels</h1><p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Real-time rooms for creator communities, members, and live sports discussion.</p></div>{creator && <Link href="/groups/create" className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black text-black"><Plus size={16}/> New group and channel</Link>}</header>
    {creator && (
      <ChannelSection title="Your channels" eyebrow="Creator workspace" channels={owned} empty={<div className="rounded-2xl border border-dashed border-lime-400/25 bg-lime-400/[.04] p-6"><h3 className="font-black text-white">No creator channel yet</h3><p className="mt-1 text-sm text-zinc-400">Create a group and its channel will be created, connected, and ready for members automatically.</p><Link href="/groups/create" className="mt-4 inline-flex items-center gap-2 text-sm font-black text-lime-300">Create your first group <ArrowRight size={14}/></Link></div>}/>
    )}
    <ChannelSection title="Available channels" eyebrow="Conversations" channels={community} empty={<div className="rounded-2xl border border-white/8 bg-white/[.025] p-10 text-center text-sm text-zinc-500">No channels are available yet.</div>}/>
  </main>
}

function ChannelSection({ title, eyebrow, channels, empty }: { title: string; eyebrow: string; channels: ChannelCardData[]; empty: React.ReactNode }) {
  return <section className="mt-9"><p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{eyebrow}</p><div className="mb-4 mt-1 flex items-center justify-between"><h2 className="text-xl font-black text-white">{title}</h2><span className="text-xs text-zinc-600">{channels.length}</span></div>{channels.length ? <div className="grid gap-3 md:grid-cols-2">{channels.map(channel => <Link key={channel.id} href={`/channels/${channel.slug}`} className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-[#101311] p-4 hover:border-lime-400/30"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-xl">{channel.icon || <Hash/>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-black text-white">{channel.name}</h3>{channel.channel_type !== 'public' && <LockKeyhole size={12} className="text-amber-300"/>}</div><p className="mt-1 truncate text-sm text-zinc-500">{channel.description || 'Community conversation'}</p><span className="mt-2 flex items-center gap-1 text-xs text-zinc-600"><Users size={12}/>{channel.member_count ?? 0} members</span></div><MessageSquareText size={17} className="text-zinc-700 group-hover:text-lime-300"/></Link>)}</div> : empty}</section>
}
