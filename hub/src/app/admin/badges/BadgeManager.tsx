'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { invalidateBadgeCache } from '@/lib/badges'
import { Trash2, Plus, UserPlus, X, ChevronDown, ChevronRight } from 'lucide-react'

type BadgeRow = { id: string; name: string; icon_url: string; description: string }
type BadgeMember = { id: string; username: string; display_name: string | null; avatar_url: string | null }
type Assignment = { badge_id: string; user: BadgeMember | null }
type FoundUser = { id: string; username: string; display_name: string | null; avatar_url: string | null }

export function BadgeManager({ userId, initialBadges, initialAssignments }: {
  userId: string; initialBadges: BadgeRow[]; initialAssignments: Assignment[]
}) {
  const [badges, setBadges] = useState(initialBadges)
  const [assignments, setAssignments] = useState(initialAssignments)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()

  const membersByBadge = (badgeId: string) => assignments.filter(a => a.badge_id === badgeId && a.user)

  async function createBadge() {
    if (!name.trim() || !description.trim()) { setError('Name and description are both required.'); return }
    if (!file) { setError('Choose an icon image.'); return }
    setError('')
    setUploading(true)
    try {
      const path = `badges/${userId}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)

      const { data, error: insertErr } = await supabase.from('badges')
        .insert({ name: name.trim(), description: description.trim(), icon_url: publicUrl })
        .select('*').single()
      if (insertErr) {
        setError(insertErr.code === '23505' ? `A badge named "${name.trim()}" already exists.` : insertErr.message)
        return
      }
      setBadges(b => [data as BadgeRow, ...b])
      setName(''); setDescription(''); setFile(null)
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  async function deleteBadge(id: string) {
    if (!confirm('Delete this badge? It will be removed from everyone who has it.')) return
    await supabase.from('badges').delete().eq('id', id)
    setBadges(b => b.filter(x => x.id !== id))
    setAssignments(a => a.filter(x => x.badge_id !== id))
    invalidateBadgeCache()
    router.refresh()
  }

  async function award(badgeId: string, u: FoundUser) {
    const { error: err } = await supabase.from('user_badges').insert({ user_id: u.id, badge_id: badgeId, awarded_by: userId })
    if (err) return // already has it (unique constraint) or transient failure — either way, nothing to reflect
    setAssignments(a => [...a, { badge_id: badgeId, user: u }])
    invalidateBadgeCache()
    router.refresh()
  }

  async function revoke(badgeId: string, uid: string) {
    await supabase.from('user_badges').delete().match({ badge_id: badgeId, user_id: uid })
    setAssignments(a => a.filter(x => !(x.badge_id === badgeId && x.user?.id === uid)))
    invalidateBadgeCache()
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      {/* Create */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">New Badge</p>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Beta Tester"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description (shown on hover)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="One of our first 120 beta testers"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Icon</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700" />
          </div>
        </div>
        <button onClick={createBadge} disabled={uploading || !name.trim() || !description.trim() || !file}
          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
          <Plus size={14} /> {uploading ? 'Creating…' : 'Create Badge'}
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {badges.length === 0 ? (
          <p className="text-sm text-zinc-600">No badges yet.</p>
        ) : (
          badges.map(b => {
            const members = membersByBadge(b.id)
            const isOpen = expanded === b.id
            return (
              <div key={b.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <img src={b.icon_url} alt={b.name} className="w-9 h-9 object-contain rounded shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{b.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{b.description}</p>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0">{members.length} member{members.length === 1 ? '' : 's'}</span>
                  <button onClick={() => setExpanded(isOpen ? null : b.id)}
                    className="text-xs font-bold border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0">
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Members
                  </button>
                  <button onClick={() => deleteBadge(b.id)} className="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Delete badge">
                    <Trash2 size={15} />
                  </button>
                </div>
                {isOpen && <BadgeMembersPanel badge={b} members={members} onAward={award} onRevoke={revoke} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function BadgeMembersPanel({ badge, members, onAward, onRevoke }: {
  badge: BadgeRow
  members: { user: BadgeMember | null }[]
  onAward: (badgeId: string, u: FoundUser) => void
  onRevoke: (badgeId: string, userId: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<FoundUser[]>([])
  const [searching, setSearching] = useState(false)
  const supabase = createClient()
  const memberIds = new Set(members.map(m => m.user?.id).filter(Boolean))

  async function search() {
    if (!q.trim()) { setResults([]); return }
    setSearching(true)
    const { data } = await supabase.from('users')
      .select('id, username, display_name, avatar_url')
      .or(`username.ilike.%${q.trim()}%,display_name.ilike.%${q.trim()}%`)
      .limit(8)
    setResults(data ?? [])
    setSearching(false)
  }

  return (
    <div className="border-t border-zinc-800 p-3 space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search users to award this badge…"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
        <button onClick={search} disabled={searching}
          className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold px-3 rounded-lg transition-colors disabled:opacity-40">
          Search
        </button>
      </div>
      {results.length > 0 && (
        <div className="space-y-1">
          {results.map(u => (
            <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/60">
              <div className="w-7 h-7 rounded-full bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
              </div>
              <span className="text-sm text-white flex-1 truncate">{u.display_name || u.username} <span className="text-zinc-500">@{u.username}</span></span>
              <button onClick={() => onAward(badge.id, u)} disabled={memberIds.has(u.id)}
                className="flex items-center gap-1 text-xs font-bold bg-green-500 hover:bg-green-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-black px-2.5 py-1 rounded-lg transition-colors shrink-0">
                <UserPlus size={11} /> {memberIds.has(u.id) ? 'Has it' : 'Award'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Currently has this badge</p>
        {members.length === 0 ? (
          <p className="text-xs text-zinc-600">No one yet.</p>
        ) : (
          <div className="space-y-1">
            {members.map(m => m.user && (
              <div key={m.user.id} className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-zinc-800/60">
                <div className="w-6 h-6 rounded-full bg-zinc-700 shrink-0 overflow-hidden flex items-center justify-center text-[9px] font-bold text-white">
                  {m.user.avatar_url ? <img src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.user.display_name || m.user.username)[0].toUpperCase()}
                </div>
                <span className="text-xs text-zinc-300 flex-1 truncate">@{m.user.username}</span>
                <button onClick={() => onRevoke(badge.id, m.user!.id)} className="text-zinc-500 hover:text-red-400 shrink-0" aria-label="Revoke">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
