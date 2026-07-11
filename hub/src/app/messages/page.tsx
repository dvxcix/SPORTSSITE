import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, Search, Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?next=/messages')

  // Get DM threads (distinct conversations)
  const { data: threads } = await supabase
    .from('messages')
    .select(`
      id, content, created_at,
      sender:users!messages_sender_id_fkey(id, username, display_name, avatar_url),
      recipient:users!messages_dm_recipient_id_fkey(id, username, display_name, avatar_url)
    `)
    .or(`sender_id.eq.${user.id},dm_recipient_id.eq.${user.id}`)
    .not('dm_recipient_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  // Deduplicate by conversation partner
  const seen = new Set<string>()
  const convos: any[] = []
  for (const m of threads ?? []) {
    const partner = (m.sender as any)?.id === user.id ? m.recipient : m.sender
    const pid = (partner as any)?.id
    if (pid && !seen.has(pid)) {
      seen.add(pid)
      convos.push({ ...m, partner })
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-lg">
            <MessageCircle size={20} className="text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Messages</h1>
            <p className="text-xs text-zinc-500">Direct messages</p>
          </div>
        </div>
        <Link href="/messages/new"
          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 text-black text-xs font-black px-3 py-2 rounded-lg transition-colors">
          <Plus size={14} /> New DM
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input placeholder="Search conversations…"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
      </div>

      {convos.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-3">💬</p>
          <p className="text-zinc-400 font-medium">No messages yet</p>
          <p className="text-zinc-600 text-sm mt-1">Start a conversation with someone</p>
          <Link href="/messages/new"
            className="inline-flex items-center gap-2 mt-4 bg-green-500 hover:bg-green-400 text-black text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={14} /> Start a DM
          </Link>
        </div>
      ) : (
        <div className="space-y-1">
          {convos.map(c => {
            const p = c.partner as any
            return (
              <Link key={p?.id} href={`/messages/${p?.username}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900 transition-colors group">
                <div className="w-11 h-11 rounded-full bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-black text-white overflow-hidden">
                  {p?.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" /> : (p?.display_name || p?.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white text-sm">{p?.display_name || p?.username}</p>
                  <p className="text-xs text-zinc-500 truncate">{c.content}</p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">
                  {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
