import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Calendar, Plus, MapPin, Clock } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

export const revalidate = 60

export default async function EventsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: upcoming } = await supabase
    .from('events')
    .select('*, host:users(username, display_name, avatar_url)')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(20)

  const { data: past } = await supabase
    .from('events')
    .select('*, host:users(username, display_name, avatar_url)')
    .lt('start_date', new Date().toISOString())
    .order('start_date', { ascending: false })
    .limit(5)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg"><Calendar size={20} className="text-blue-400" /></div>
          <div>
            <h1 className="text-xl font-black text-white">Events</h1>
            <p className="text-xs text-zinc-500">Watch parties, drafts & more</p>
          </div>
        </div>
        {user && (
          <Link href="/events/create"
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Create Event
          </Link>
        )}
      </div>

      {(upcoming?.length ?? 0) === 0 && (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-zinc-400 font-medium">No upcoming events</p>
          {user && <Link href="/events/create" className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors"><Plus size={14} /> Create one</Link>}
        </div>
      )}

      {(upcoming?.length ?? 0) > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Upcoming</h2>
          <div className="space-y-3">
            {(upcoming ?? []).map((e: any) => <EventCard key={e.id} event={e} />)}
          </div>
        </div>
      )}

      {(past?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Past Events</h2>
          <div className="space-y-2 opacity-60">
            {(past ?? []).map((e: any) => <EventCard key={e.id} event={e} past />)}
          </div>
        </div>
      )}
    </div>
  )
}

function EventCard({ event, past }: { event: any; past?: boolean }) {
  const start = new Date(event.start_date)
  return (
    <Link href={`/events/${event.id}`}
      className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all">
      {/* Date block */}
      <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-zinc-800 shrink-0 text-center">
        <p className="text-xs font-bold text-zinc-500 uppercase">{start.toLocaleDateString('en-US', { month: 'short' })}</p>
        <p className="text-2xl font-black text-white leading-none">{start.getDate()}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-white truncate">{event.title}</p>
        {event.description && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">{event.description}</p>}
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs text-zinc-500">
            <Clock size={10} /> {start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <MapPin size={10} /> {event.location}
            </span>
          )}
          {event.sport && (
            sportLogoUrl(event.sport)
              ? <img src={sportLogoUrl(event.sport)} alt={event.sport} className="w-3.5 h-3.5 object-contain" />
              : <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full">{event.sport}</span>
          )}
          {past && <span className="text-[10px] font-bold text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded-full">Past</span>}
        </div>
        <p className="text-xs text-zinc-600 mt-1">by @{event.host?.display_name || event.host?.username}</p>
      </div>
    </Link>
  )
}
