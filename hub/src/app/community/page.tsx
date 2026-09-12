import Link from 'next/link'
import { ArrowRight, CalendarDays, Hash, MessageSquareText, Radio, Sparkles, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CommunityNav } from '@/components/community/CommunityNav'
import { ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'
import { SafeImage } from '@/components/ui/SafeImage'

export const revalidate = 60

export default async function CommunityPage() {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const [{ data: groups }, { data: channels }, { data: discussions }, { data: events }] = await Promise.all([
    supabase.from('groups').select('id,slug,name,description,avatar_url,emoji,member_count,access_type').eq('is_public', true).order('member_count', { ascending: false }).limit(4),
    supabase.from('channels').select('id,slug,name,description,icon,member_count,channel_type,is_pinned').order('is_pinned', { ascending: false }).order('member_count', { ascending: false }).limit(4),
    supabase.from('forum_categories').select('id,slug,name,description,icon,thread_count').order('sort_order', { ascending: true }).limit(4),
    supabase.from('events').select('id,title,start_date,going_count').gte('start_date', now).order('start_date', { ascending: true }).limit(3),
  ])

  const totalSpaces = (groups?.length ?? 0) + (channels?.length ?? 0) + (discussions?.length ?? 0)

  return (
    <ProductPageShell>
      <CommunityNav />
      <ProductHero
        icon={<Sparkles size={22} />}
        eyebrow="SlipSurge community"
        title="Your sports world, together"
        description="Move between communities, live rooms, discussions, events, and direct conversations without losing the game."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Community destinations">
        <Destination href="/groups" icon={<Users size={19} />} label="Groups" detail="Communities, roles, and member feeds" count={groups?.length ?? 0} />
        <Destination href="/channels" icon={<Radio size={19} />} label="Live rooms" detail="Fast game-day conversation" count={channels?.length ?? 0} />
        <Destination href="/forum" icon={<Hash size={19} />} label="Discussions" detail="Structured questions and threads" count={discussions?.length ?? 0} />
        <Destination href="/messages" icon={<MessageSquareText size={19} />} label="Messages" detail="Private conversations and requests" />
      </section>

      <ProductSectionHeader title="Communities to join" meta={totalSpaces ? 'Active spaces' : 'Getting started'} />
      {(groups?.length ?? 0) > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {(groups ?? []).map(group => (
            <Link key={group.id} href={`/groups/${group.slug}`} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] hover:bg-[var(--surface-2)]">
              <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-3)] text-2xl"><SafeImage src={group.avatar_url} alt="" className="h-full w-full object-cover" fallback={group.emoji || '⚡'} /></span>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="truncate text-sm text-[var(--text-1)]">{group.name}</strong>{group.access_type !== 'free' ? <small className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[9px] font-black uppercase text-amber-300">Member</small> : null}</span><span className="mt-1 line-clamp-1 text-xs text-[var(--text-3)]">{group.description || 'Community conversation'}</span><span className="mt-2 block text-[10px] font-bold text-[var(--text-3)]">{group.member_count ?? 0} members</span></span>
              <ArrowRight size={15} className="text-[var(--text-3)] transition group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
            </Link>
          ))}
        </div>
      ) : <ProductPanel padded className="text-center"><Users size={24} className="mx-auto text-[var(--text-3)]" /><p className="mt-3 text-sm font-black text-[var(--text-1)]">Communities are being prepared</p></ProductPanel>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section>
          <ProductSectionHeader title="Join the conversation" meta="Rooms and discussions" />
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            {(channels ?? []).slice(0, 3).map(channel => <CompactRow key={channel.id} href={`/channels/${channel.slug}`} icon={channel.icon || '#'} title={channel.name} detail={channel.description || 'Live community room'} meta={`${channel.member_count ?? 0} members`} />)}
            {(discussions ?? []).slice(0, 3).map(category => <CompactRow key={category.id} href={`/forum/${category.slug}`} icon={category.icon || '◆'} title={category.name} detail={category.description || 'Community discussion'} meta={`${category.thread_count ?? 0} threads`} />)}
          </div>
        </section>
        <section>
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

function Destination({ href, icon, label, detail, count }: { href: string; icon: React.ReactNode; label: string; detail: string; count?: number }) {
  return <Link href={href} className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(255,255,255,.035),transparent_48%),var(--surface)] p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_30%,var(--border))]"><span className="grid size-10 place-items-center rounded-xl border border-[var(--border-accent)] bg-[var(--accent-dim)] text-[var(--accent)]">{icon}</span><strong className="mt-4 block text-sm text-[var(--text-1)]">{label}</strong><span className="mt-1 block text-[11px] leading-4 text-[var(--text-3)]">{detail}</span>{typeof count === 'number' ? <span className="absolute right-4 top-4 font-mono text-[10px] font-black text-[var(--text-3)]">{count}</span> : null}</Link>
}

function CompactRow({ href, icon, title, detail, meta }: { href: string; icon: React.ReactNode; title: string; detail: string; meta: string }) {
  return <Link href={href} className="group flex min-h-16 items-center gap-3 border-b border-[var(--hairline)] px-4 py-3 last:border-0 hover:bg-[var(--surface-2)]"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-3)] text-sm text-[var(--accent)]">{icon}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-[var(--text-1)]">{title}</strong><span className="mt-0.5 block truncate text-[10px] text-[var(--text-3)]">{detail}</span></span><small className="shrink-0 font-mono text-[9px] text-[var(--text-3)]">{meta}</small><ArrowRight size={13} className="shrink-0 text-[var(--text-3)] group-hover:text-[var(--accent)]" /></Link>
}
