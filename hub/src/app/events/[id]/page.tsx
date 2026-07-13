import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { EventRSVPButtons } from '@/components/events/EventRSVPButtons'
import { Calendar, MapPin, Clock, Link as LinkIcon, Users } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('title, description, cover_image, start_date').eq('id', id).single()
  if (!event) return {}
  const when = event.start_date ? new Date(event.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
  const description = `${when ? `${when} — ` : ''}${event.description || event.title}`
  return {
    title: `${event.title} · SlipSurge`,
    description,
    openGraph: { title: event.title, description, images: event.cover_image ? [event.cover_image] : undefined },
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: event } = await supabase
    .from('events')
    .select('*, host:users(username, display_name, avatar_url, is_verified)')
    .eq('id', id)
    .single()
  if (!event) notFound()

  let userRsvp: string | null = null
  if (user) {
    const { data } = await supabase.from('event_rsvps').select('status').eq('user_id', user.id).eq('event_id', id).maybeSingle()
    userRsvp = data?.status ?? null
  }

  const start = new Date(event.start_date)
  const end = event.end_date ? new Date(event.end_date) : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {event.cover_image && (
        <div className="h-48 rounded-2xl overflow-hidden mb-4">
          <img src={event.cover_image} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}

      {event.sport && (
        sportLogoUrl(event.sport)
          ? <span className="inline-flex bg-blue-400/10 rounded-full p-1.5 mb-3"><img src={sportLogoUrl(event.sport)} alt={event.sport} className="w-5 h-5 object-contain" /></span>
          : <span className="inline-block text-xs font-bold text-blue-400 bg-blue-400/10 px-2.5 py-1 rounded-full mb-3">{event.sport}</span>
      )}
      <h1 className="text-2xl font-black text-white mb-4">{event.title}</h1>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3 mb-4">
        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-green-400 shrink-0" />
          <p className="text-sm text-zinc-200">
            {start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Clock size={16} className="text-zinc-500 shrink-0" />
          <p className="text-sm text-zinc-400">
            {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {end && ` – ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
          </p>
        </div>
        {event.location && (
          <div className="flex items-center gap-3">
            <MapPin size={16} className="text-zinc-500 shrink-0" />
            <p className="text-sm text-zinc-400">{event.location}</p>
          </div>
        )}
        {event.link && (
          <div className="flex items-center gap-3">
            <LinkIcon size={16} className="text-blue-400 shrink-0" />
            <a href={event.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline truncate">{event.link}</a>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Users size={16} className="text-zinc-500 shrink-0" />
          <p className="text-sm text-zinc-400">
            <span className="text-white font-bold">{event.going_count ?? 0}</span> going · <span className="text-white font-bold">{event.interested_count ?? 0}</span> interested
          </p>
        </div>
      </div>

      {user ? (
        <EventRSVPButtons userId={user.id} eventId={event.id} initialRsvp={userRsvp} />
      ) : (
        <a href="/auth/login" className="block w-full text-center bg-green-500 hover:bg-green-400 text-black font-black py-3 rounded-xl transition-colors">
          Sign in to RSVP
        </a>
      )}

      {event.description && (
        <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{event.description}</p>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
        <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden">
          {event.host?.avatar_url && <img src={event.host.avatar_url} alt="" className="w-full h-full object-cover" />}
        </div>
        Hosted by <a href={`/profile/${event.host?.username}`} className="text-zinc-300 font-bold hover:text-white">@{event.host?.display_name || event.host?.username}</a>
      </div>
    </div>
  )
}
