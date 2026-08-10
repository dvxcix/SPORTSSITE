import { createClient } from '@/lib/supabase/server'
import { hasCreatorAccess } from '@/lib/creator'
import Link from 'next/link'
import { ArrowRight, Compass, LockKeyhole, MessageSquareText, Plus, Settings2, Sparkles, Users } from 'lucide-react'
import Image from 'next/image'

type GroupCardData = { id: string; slug: string; name: string; description?: string | null; avatar_url?: string | null; emoji?: string | null; access_type?: string | null; member_count?: number | null }

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [{ data: profile }, { data: approval }, { data: visibleGroups }] = await Promise.all([
    user ? supabase.from('users').select('account_type').eq('id', user.id).single() : Promise.resolve({ data: null }),
    user ? supabase.from('creator_applications').select('id').eq('user_id', user.id).eq('status', 'approved').maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('groups').select('*').order('member_count', { ascending: false }).limit(50),
  ])
  const creator = hasCreatorAccess(profile?.account_type, Boolean(approval))
  const owned = (visibleGroups ?? []).filter(group => group.owner_id === user?.id)
  const discover = (visibleGroups ?? []).filter(group => group.owner_id !== user?.id && group.is_public)

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <section className="relative overflow-hidden rounded-3xl border border-lime-400/20 bg-[radial-gradient(circle_at_top_left,rgba(163,255,68,.16),transparent_38%),#0c0f0d] p-6 sm:p-9">
        <div className="relative z-10 max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[.18em] text-lime-300"><Sparkles size={14}/> Community</p>
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-5xl">Groups built around the edge.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">Join creator communities, unlock member content, and keep every conversation beside the tools you use.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {creator && <Link href="/groups/create" className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black text-black hover:bg-lime-300"><Plus size={16}/> Create a group</Link>}
            {creator && <Link href="/creators/studio" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10"><Settings2 size={16}/> Creator Studio</Link>}
          </div>
        </div>
      </section>

      {creator && <section className="mt-8">
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-lime-300">Creator workspace</p><h2 className="mt-1 text-xl font-black text-white">Your communities</h2></div><span className="text-xs text-zinc-500">{owned.length} total</span></div>
        {owned.length ? <div className="grid gap-3 md:grid-cols-2">{owned.map(group => <GroupCard key={group.id} group={group} owner />)}</div> : <div className="grid gap-5 rounded-2xl border border-dashed border-lime-400/25 bg-lime-400/[.04] p-6 md:grid-cols-[1fr_auto] md:items-center"><div><h3 className="font-black text-white">Launch your first creator group</h3><p className="mt-1 text-sm text-zinc-400">Creating a group provisions its dedicated channel automatically. You can keep it free or connect paid access from Creator Studio.</p></div><Link href="/groups/create" className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-sm font-black text-black">Build community <ArrowRight size={15}/></Link></div>}
      </section>}

      <section className="mt-10">
        <div className="mb-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500"><Compass size={14}/> Discover</p><h2 className="mt-1 text-xl font-black text-white">Public groups</h2></div>
        {discover.length ? <div className="grid gap-3 md:grid-cols-2">{discover.map(group => <GroupCard key={group.id} group={group} />)}</div> : <div className="rounded-2xl border border-white/8 bg-white/[.025] p-10 text-center"><Users className="mx-auto text-zinc-600"/><p className="mt-3 font-bold text-zinc-300">No public groups yet</p><p className="mt-1 text-sm text-zinc-600">Creator communities will appear here as they launch.</p></div>}
      </section>
    </main>
  )
}

function GroupCard({ group, owner = false }: { group: GroupCardData; owner?: boolean }) {
  return <Link href={`/groups/${group.slug}`} className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-[#101311] p-4 transition hover:-translate-y-0.5 hover:border-lime-400/30 hover:bg-[#131713]">
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-white/5 text-2xl">{group.avatar_url ? <Image src={group.avatar_url} alt="" fill sizes="56px" className="object-cover"/> : group.emoji || '⚡'}</div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black text-white">{group.name}</h3>{owner && <span className="rounded-full bg-lime-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-lime-300">Owner</span>}{group.access_type !== 'free' && <span className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300"><LockKeyhole size={10}/> Paid</span>}</div><p className="mt-1 truncate text-sm text-zinc-500">{group.description || 'Creator community'}</p><p className="mt-2 flex items-center gap-3 text-xs text-zinc-600"><span className="flex items-center gap-1"><Users size={12}/>{group.member_count ?? 0}</span><span className="flex items-center gap-1"><MessageSquareText size={12}/> Channel included</span></p></div><ArrowRight size={16} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300"/>
  </Link>
}
