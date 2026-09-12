import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { EventRSVPButtons } from '@/components/events/EventRSVPButtons'
import { Calendar, ChevronLeft, Clock, Link as LinkIcon, MapPin, Radio, Users } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { MemberAvatar } from '@/components/social/MemberAvatar'
import { ProductPageShell, ProductPanel } from '@/components/product/ProductPage'
import type { Metadata } from 'next'
import { SafeImage } from '@/components/ui/SafeImage'
import { CommunityNav } from '@/components/community/CommunityNav'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('title, description, cover_image, start_date').eq('id', id).single()
  if (!event) return {}
  const when = event.start_date ? new Date(event.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
  const description = `${when ? `${when} — ` : ''}${event.description || event.title}`
  return { title: `${event.title} · SlipSurge`, description, openGraph: { title: event.title, description, images: event.cover_image ? [event.cover_image] : undefined } }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: { user } }, { data: event }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('events').select('*, host:users(username, display_name, avatar_url, is_verified)').eq('id', id).single(),
  ])
  if (!event) notFound()
  const { data: rsvp } = user ? await supabase.from('event_rsvps').select('status').eq('user_id', user.id).eq('event_id', id).maybeSingle() : { data: null }
  const start = new Date(event.start_date)
  const end = event.end_date ? new Date(event.end_date) : null
  const logo = event.sport ? sportLogoUrl(event.sport) : null

  return (
    <ProductPageShell narrow>
      <CommunityNav />
      <Link href="/events" className="ss-flow-back"><ChevronLeft size={14} /> Events</Link>
      <article className="overflow-hidden rounded-[24px] border border-white/[.08] bg-gradient-to-br from-white/[.04] to-white/[.015] shadow-2xl">
        {event.cover_image && <div className="relative h-52 overflow-hidden sm:h-72"><SafeImage src={event.cover_image} alt="" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#0c0f0d] via-transparent to-transparent" /></div>}
        <div className="p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">{logo && <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/[.08] bg-white/[.05]"><SafeImage src={logo} alt="" className="h-5 w-5 object-contain" /></span>}{event.is_online && <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-2.5 py-1 text-[10px] font-black uppercase text-sky-300"><Radio size={11} /> Online</span>}</div>
          <h1 className="mt-4 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">{event.title}</h1>
          <Link href={`/profile/${event.host?.username}`} className="mt-4 inline-flex items-center gap-2.5 text-xs font-bold text-zinc-400 hover:text-white"><MemberAvatar src={event.host?.avatar_url} name={event.host?.display_name || event.host?.username || 'Host'} size={30} /><span>Hosted by @{event.host?.username}</span></Link>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Info icon={<Calendar size={16} />} value={start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} />
            <Info icon={<Clock size={16} />} value={`${start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}${end ? ` – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`} />
            {event.location && <Info icon={<MapPin size={16} />} value={event.location} />}
            <Info icon={<Users size={16} />} value={`${event.going_count ?? 0} going · ${event.interested_count ?? 0} interested`} />
          </div>

          <div className="mt-5">{user ? <EventRSVPButtons userId={user.id} eventId={event.id} initialRsvp={rsvp?.status ?? null} /> : <Link href={`/auth/login?next=/events/${event.id}`} className="block w-full rounded-xl bg-lime-400 py-3 text-center text-sm font-black text-black hover:bg-lime-300">Sign in to RSVP</Link>}</div>
          {event.description && <ProductPanel padded className="mt-5"><p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{event.description}</p></ProductPanel>}
          {event.link && <a href={event.link} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center gap-2 truncate text-xs font-bold text-sky-300 hover:text-sky-200"><LinkIcon size={14} /> Open event link</a>}
        </div>
      </article>
    </ProductPageShell>
  )
}

function Info({ icon, value }: { icon: React.ReactNode; value: string }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[.07] bg-black/20 px-3 py-3 text-lime-300"><span className="shrink-0">{icon}</span><span className="min-w-0 text-xs font-bold leading-5 text-zinc-300">{value}</span></div>
}
