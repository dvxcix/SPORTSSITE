import { createClient } from '@/lib/supabase/server'
import { hasCreatorAccess } from '@/lib/creator'
import Link from 'next/link'
import { ArrowRight, LockKeyhole, MessageSquareText, Plus, Settings2, Sparkles, Users } from 'lucide-react'
import { SafeImage } from '@/components/ui/SafeImage'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'

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
    <ProductPageShell>
      <CommunityNav />
      <ProductHero icon={<Sparkles size={21}/>} eyebrow="Community" title="Groups" description="Join communities built around games, markets, and creators." actions={creator ? <><ProductAction href="/groups/create"><Plus size={15}/> New group</ProductAction><ProductAction href="/creators/studio"><Settings2 size={15}/> Studio</ProductAction></> : undefined}/>

      {creator && <section className="mt-8">
        <ProductSectionHeader title="Your communities" meta={`${owned.length} total`}/>
        {owned.length ? <div className="grid gap-3 md:grid-cols-2">{owned.map(group => <GroupCard key={group.id} group={group} owner />)}</div> : <ProductPanel padded className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><h3 className="font-black text-white">Launch your first community</h3></div><Link href="/groups/create" className="inline-flex items-center gap-2 text-sm font-black text-lime-300">Create community <ArrowRight size={15}/></Link></ProductPanel>}
      </section>}

      <section className="mt-10">
        <ProductSectionHeader title="Public groups" meta="Discover"/>
        {discover.length ? <div className="grid gap-3 md:grid-cols-2">{discover.map(group => <GroupCard key={group.id} group={group} />)}</div> : <div className="rounded-2xl border border-white/8 bg-white/[.025] p-10 text-center"><Users className="mx-auto text-zinc-600"/><p className="mt-3 font-bold text-zinc-300">No public groups yet</p><p className="mt-1 text-sm text-zinc-600">Creator communities will appear here as they launch.</p></div>}
      </section>
    </ProductPageShell>
  )
}

function GroupCard({ group, owner = false }: { group: GroupCardData; owner?: boolean }) {
  return <Link href={`/groups/${group.slug}`} className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-[#101311] p-4 transition hover:-translate-y-0.5 hover:border-lime-400/30 hover:bg-[#131713]">
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/8 bg-white/5 text-2xl"><SafeImage src={group.avatar_url} alt="" className="h-full w-full object-cover" fallback={group.emoji || '⚡'} /></div>
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-black text-white">{group.name}</h3>{owner && <span className="rounded-full bg-lime-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-lime-300">Owner</span>}{group.access_type !== 'free' && <span className="flex items-center gap-1 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300"><LockKeyhole size={10}/> Paid</span>}</div><p className="mt-1 truncate text-sm text-zinc-500">{group.description || 'Creator community'}</p><p className="mt-2 flex items-center gap-3 text-xs text-zinc-600"><span className="flex items-center gap-1"><Users size={12}/>{group.member_count ?? 0}</span><span className="flex items-center gap-1"><MessageSquareText size={12}/> Channel included</span></p></div><ArrowRight size={16} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300"/>
  </Link>
}
