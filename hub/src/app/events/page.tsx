import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Clock3, MapPin, Plus, Radio, Users } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { CommunityNav } from '@/components/community/CommunityNav'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { ProductAction, ProductHero, ProductPageShell, ProductPanel, ProductSectionHeader } from '@/components/product/ProductPage'

export const revalidate = 60

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date().toISOString()
  const selection = '*, host:users(username, display_name, avatar_url)'
  const [{ data: upcoming }, { data: past }] = await Promise.all([
    supabase.from('events').select(selection).gte('start_date', now).order('start_date', { ascending: true }).limit(20),
    supabase.from('events').select(selection).lt('start_date', now).order('start_date', { ascending: false }).limit(6),
  ])

  return (
    <ProductPageShell>
      <CommunityNav />
      <ProductHero
        icon={<CalendarDays size={22} />}
        eyebrow="Community calendar"
        title="Events"
        description="Watch parties, live rooms, meetups, and game-day gatherings."
        actions={user ? <ProductAction href="/events/create"><Plus size={15} /> Create event</ProductAction> : undefined}
      />
      <ProductSectionHeader title="Upcoming" meta={`${upcoming?.length ?? 0} events`} />
      {(upcoming?.length ?? 0) > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2">{(upcoming ?? []).map((event: any) => <EventCard key={event.id} event={event} />)}</div>
      ) : (
        <ProductPanel padded className="text-center">
          <CalendarDays className="mx-auto text-zinc-600" size={28} />
          <p className="mt-3 font-black text-white">Nothing scheduled yet</p>
          {user && <Link href="/events/create" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black"><Plus size={14} /> Create event</Link>}
        </ProductPanel>
      )}
      {(past?.length ?? 0) > 0 && <><ProductSectionHeader title="Recent" /><div className="grid gap-3 opacity-70 lg:grid-cols-2">{(past ?? []).map((event: any) => <EventCard key={event.id} event={event} past />)}</div></>}
    </ProductPageShell>
  )
}

function EventCard({ event, past = false }: { event: any; past?: boolean }) {
  const start = new Date(event.start_date)
  const logo = event.sport ? sportLogoUrl(event.sport) : null
  return (
    <Link href={`/events/${event.id}`} className="group grid grid-cols-[58px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-white/[.08] bg-gradient-to-br from-white/[.04] to-white/[.015] p-4 shadow-[inset_0_1px_rgba(255,255,255,.025)] transition hover:-translate-y-0.5 hover:border-lime-400/25">
      <div className="grid h-[58px] place-content-center rounded-2xl border border-white/[.08] bg-black/25 text-center"><span className="text-[9px] font-black uppercase tracking-widest text-lime-300">{start.toLocaleDateString('en-US', { month: 'short' })}</span><strong className="text-xl font-black leading-none text-white">{start.getDate()}</strong></div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">{logo && <img src={logo} alt="" className="h-4 w-4 object-contain" />}<h2 className="truncate text-sm font-black text-white">{event.title}</h2>{past && <span className="rounded-full bg-white/[.06] px-2 py-0.5 text-[9px] font-black uppercase text-zinc-500">Ended</span>}</div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-zinc-500">
          <span className="flex items-center gap-1"><Clock3 size={11} />{start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          {event.location && <span className="flex min-w-0 items-center gap-1"><MapPin size={11} /><span className="truncate">{event.location}</span></span>}
          {event.is_online && <span className="flex items-center gap-1 text-sky-300"><Radio size={11} />Online</span>}
          <span className="flex items-center gap-1"><Users size={11} />{event.going_count ?? 0}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-600"><MemberAvatar src={event.host?.avatar_url} name={event.host?.display_name || event.host?.username || 'Host'} size={22} /><span className="truncate">@{event.host?.username}</span></div>
      </div>
      <ArrowRight size={16} className="text-zinc-700 transition group-hover:translate-x-1 group-hover:text-lime-300" />
    </Link>
  )
}
