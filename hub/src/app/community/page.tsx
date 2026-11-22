import Link from 'next/link'
import { ArrowRight, CalendarDays, Hash, MessageSquareText, Radio, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductAction, ProductHero, ProductPageShell, ProductSectionHeader } from '@/components/product/ProductPage'
import { CommunityDirectory } from '@/components/groups/CommunityDirectory'
import { publishedPaidCommunities, type CommunityDirectoryEntry } from '@/lib/creatorCommunityDirectory'
import { canViewMlb } from '@/lib/mlbViewerAccess'

export const dynamic = 'force-dynamic'

export default async function CommunityPage() {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const [viewer, { data: groupRows }, { data: channels }, { data: discussions }, { data: events }] = await Promise.all([
    supabase.auth.getUser().catch(() => null),
    supabase.from('groups').select('id,slug,name,description,avatar_url,banner_url,emoji,member_count,access_type,sport,owner_id,creator_product_id,is_public').eq('is_public', true).order('member_count', { ascending: false }).limit(50),
    supabase.from('channels').select('id,slug,name,description,icon,member_count,channel_type,is_pinned').order('is_pinned', { ascending: false }).order('member_count', { ascending: false }).limit(4),
    supabase.from('forum_categories').select('id,slug,name,description,icon,thread_count').order('sort_order', { ascending: true }).limit(4),
    supabase.from('events').select('id,title,start_date,going_count').gte('start_date', now).order('start_date', { ascending: true }).limit(3),
  ])
  const showMlb = await canViewMlb(supabase, viewer?.error ? undefined : viewer?.data?.user?.id)
  const userId=viewer?.data?.user?.id
  const [paid,{data:memberships}]=await Promise.all([publishedPaidCommunities(),userId?supabase.from('group_members').select('group_id').eq('user_id',userId):Promise.resolve({data:[]})])
  const groups=[...new Map([...(groupRows??[]),...paid].map(group=>[group.id,group])).values()].filter(group=>showMlb||group.sport?.toUpperCase()!=='MLB') as CommunityDirectoryEntry[]


  return (
    <ProductPageShell>
      <CommunityNav />
      <ProductHero
        icon={<Users size={22} />}
        eyebrow="SlipSurge community"
        title="Find your community"
        description="Explore communities for picks, research and game-day conversation."
        actions={<ProductAction href="/creators/studio">Start a community <ArrowRight size={15}/></ProductAction>}
      />



      <CommunityDirectory groups={groups} joinedIds={(memberships??[]).map(row=>row.group_id)} userId={userId??null} invitations={[]}/>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Community destinations">
        <Destination href="/groups" icon={<Users size={19} />} label="Groups" detail="Communities and member feeds" />
        <Destination href="/channels" icon={<Radio size={19} />} label="Live rooms" detail="Game-day conversation" />
        <Destination href="/forum" icon={<Hash size={19} />} label="Discussions" detail="Questions and threads" />
        <Destination href="/messages" icon={<MessageSquareText size={19} />} label="Messages" detail="Private conversations and requests" />
      </section>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section className="min-w-0">
          <ProductSectionHeader title="Join the conversation" meta="Rooms and discussions" />
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {(channels ?? []).slice(0, 3).map(channel => <CompactRow key={channel.id} href={`/channels/${channel.slug}`} icon={channel.icon || '#'} title={channel.name} detail={channel.description || 'Live community room'} meta={`${channel.member_count ?? 0} members`} />)}
            {(discussions ?? []).slice(0, 3).map(category => <CompactRow key={category.id} href={`/forum/${category.slug}`} icon={category.icon || '◆'} title={category.name} detail={category.description || 'Community discussion'} meta={`${category.thread_count ?? 0} threads`} />)}
          </div>
        </section>
        <section className="min-w-0">
          <ProductSectionHeader title="Upcoming" meta="Community events" />
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {(events?.length ?? 0) > 0 ? (events ?? []).map(event => {
              const start = new Date(event.start_date)
              return <CompactRow key={event.id} href={`/events/${event.id}`} icon={<CalendarDays size={16} />} title={event.title} detail={start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} meta={`${event.going_count ?? 0} going`} />
            }) : <div className="grid min-h-40 place-items-center px-5 text-center"><div><CalendarDays size={22} className="mx-auto text-[var(--text-3)]" /><p className="mt-2 text-xs font-bold text-[var(--text-2)]">No upcoming events</p></div></div>}
          </div>
        </section>
      </div>
    </ProductPageShell>
  )
}

function Destination({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) {
  return <Link href={href} className="group relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--border-2)] hover:bg-[var(--surface-2)]"><span className="grid size-10 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-2)]">{icon}</span><strong className="mt-4 block text-sm text-[var(--text-1)]">{label}</strong><span className="mt-1 block text-xs leading-5 text-[var(--text-2)]">{detail}</span></Link>
}

function CompactRow({ href, icon, title, detail, meta }: { href: string; icon: React.ReactNode; title: string; detail: string; meta: string }) {
  return <Link href={href} className="group flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-0 hover:bg-[var(--surface-2)]"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-3)] text-sm text-[var(--text-2)]">{icon}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-[var(--text-1)]">{title}</strong><span className="mt-0.5 block truncate text-xs text-[var(--text-2)]">{detail}</span></span><small className="shrink-0 text-xs text-[var(--text-3)]">{meta}</small><ArrowRight size={13} className="shrink-0 text-[var(--text-3)]" /></Link>
}
