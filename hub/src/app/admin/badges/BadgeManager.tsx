'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { invalidateBadgeCache } from '@/lib/badges'
import { uploadMedia } from '@/lib/uploadMedia'
import { Trash2, Plus, UserPlus, X, ChevronDown, ChevronRight, Users, Pencil, Sparkles } from 'lucide-react'
import { useFeedback } from '@/components/ui/FeedbackProvider'
import { SafeImage } from '@/components/ui/SafeImage'

type BadgeRow = { id: string; name: string; icon_url: string; description: string; card_image_url: string | null }
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
  const [editing, setEditing] = useState<string | null>(null)
  const supabase = createClient()
  const router = useRouter()
  const { confirm, notify } = useFeedback()

  const membersByBadge = (badgeId: string) => assignments.filter(a => a.badge_id === badgeId && a.user)

  async function createBadge() {
    if (!name.trim() || !description.trim()) { setError('Name and description are both required.'); return }
    if (!file) { setError('Choose an icon image.'); return }
    setError('')
    setUploading(true)
    try {
      const uploaded = await uploadMedia(file, 'badges')
      if ('error' in uploaded) { setError(uploaded.error); return }
      const { publicUrl } = uploaded

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

  async function updateBadge(id: string, patch: { name: string; description: string; iconFile: File | null; cardFile: File | null; removeCard: boolean }) {
    setError('')
    const update: Record<string, any> = { name: patch.name.trim(), description: patch.description.trim() }
    if (patch.iconFile) {
      const uploaded = await uploadMedia(patch.iconFile, 'badges')
      if ('error' in uploaded) { setError(uploaded.error); return false }
      update.icon_url = uploaded.publicUrl
    }
    if (patch.cardFile) {
      const uploaded = await uploadMedia(patch.cardFile, 'badge-cards')
      if ('error' in uploaded) { setError(uploaded.error); return false }
      update.card_image_url = uploaded.publicUrl
    } else if (patch.removeCard) {
      update.card_image_url = null
    }

    const { data, error: err } = await supabase.from('badges').update(update).eq('id', id).select('*').single()
    if (err) {
      setError(err.code === '23505' ? `A badge named "${patch.name.trim()}" already exists.` : err.message)
      return false
    }
    setBadges(b => b.map(x => x.id === id ? (data as BadgeRow) : x))
    invalidateBadgeCache()
    router.refresh()
    return true
  }

  async function deleteBadge(id: string) {
    if (!await confirm({ title: 'Delete badge?', message: 'The badge will be removed from every member who has it.', confirmLabel: 'Delete badge', tone: 'error' })) return
    const { error } = await supabase.from('badges').delete().eq('id', id)
    if (error) { notify({ title: 'Badge not deleted', message: error.message, tone: 'error' }); return }
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
    const { error } = await supabase.from('user_badges').delete().match({ badge_id: badgeId, user_id: uid })
    if (error) { notify({ title: 'Badge not revoked', message: error.message, tone: 'error' }); return }
    setAssignments(a => a.filter(x => !(x.badge_id === badgeId && x.user?.id === uid)))
    invalidateBadgeCache()
    router.refresh()
  }

  // One-time snapshot of "everyone right now" — deliberately not a toggle
  // that keeps auto-awarding to every future signup, since a badge like
  // "Beta Tester" should mean "was here for the beta," not "is a user."
  async function awardAll(badgeId: string) {
    const alreadyHas = new Set(assignments.filter(a => a.badge_id === badgeId).map(a => a.user?.id))
    const { data: allUsers } = await supabase.from('users').select('id, username, display_name, avatar_url').limit(1000)
    const toAward = (allUsers ?? []).filter(u => !alreadyHas.has(u.id))
    if (toAward.length === 0) return
    if (!await confirm({ title: 'Award badge to eligible members?', message: `Award "${badges.find(b => b.id === badgeId)?.name}" to ${toAward.length} member(s) who do not already have it?`, confirmLabel: 'Award badge' })) return

    const { error: err } = await supabase.from('user_badges')
      .insert(toAward.map(u => ({ user_id: u.id, badge_id: badgeId, awarded_by: userId })))
    if (err) { setError(err.message); return }
    setAssignments(a => [...a, ...toAward.map(u => ({ badge_id: badgeId, user: u as BadgeMember }))])
    invalidateBadgeCache()
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}

      {/* Create */}
      <div className="ss-badge-create-panel">
        <p className="text-xs font-bold text-[var(--text-2)] uppercase tracking-wider">New Badge</p>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Beta Tester"
              className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Description (shown on hover)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="One of our first 120 beta testers"
              className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Icon</label>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="text-xs text-[var(--text-2)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--surface-2)] file:text-[var(--text-1)] hover:file:bg-[var(--surface-3)]" />
          </div>
        </div>
        <button onClick={createBadge} disabled={uploading || !name.trim() || !description.trim() || !file}
          className="flex items-center gap-1.5 bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
          <Plus size={14} /> {uploading ? 'Creating…' : 'Create Badge'}
        </button>
      </div>

      {/* List */}
      <div className="ss-badge-admin-grid">
        {badges.length === 0 ? (
          <p className="text-sm text-[var(--text-3)]">No badges yet.</p>
        ) : (
          badges.map(b => {
            const members = membersByBadge(b.id)
            const isOpen = expanded === b.id
            const isEditing = editing === b.id
            return (
              <div key={b.id} className="ss-badge-admin-card">
                <div className="ss-badge-admin-summary">
                  <span className="ss-badge-admin-icon"><SafeImage src={b.icon_url} alt={b.name} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-[var(--text-1)] truncate flex items-center gap-1.5">
                      {b.name}
                      {b.card_image_url && <Sparkles size={12} className="text-[var(--green)] shrink-0" />}
                    </p>
                    <p className="text-xs text-[var(--text-3)] truncate">{b.description}</p>
                  </div>
                  <span className="text-xs text-[var(--text-3)] shrink-0">{members.length} member{members.length === 1 ? '' : 's'}</span>
                  <button type="button" onClick={() => { setEditing(isEditing ? null : b.id); setExpanded(null) }}
                    className="text-xs font-bold border border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0">
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" onClick={() => { setExpanded(isOpen ? null : b.id); setEditing(null) }} aria-expanded={isOpen}
                    className="text-xs font-bold border border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)] px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0">
                    {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Members
                  </button>
                  <button type="button" onClick={() => deleteBadge(b.id)} className="text-[var(--text-3)] hover:text-[var(--red)] shrink-0" aria-label={`Delete ${b.name} badge`}>
                    <Trash2 size={15} />
                  </button>
                </div>
                {isEditing && <BadgeEditPanel badge={b} onSave={patch => updateBadge(b.id, patch).then(ok => { if (ok) setEditing(null) })} onCancel={() => setEditing(null)} />}
                {isOpen && <BadgeMembersPanel badge={b} members={members} onAward={award} onRevoke={revoke} onAwardAll={awardAll} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// Name/description/icon are always editable. The card is a separate,
// optional add-on: a badge can be JUST the small name-badge (no card), or
// also get a bigger "collectors card" image shown in a profile's
// Achievements section — this panel is where that gets turned on and its
// art gets uploaded, independent of the icon.
function BadgeEditPanel({ badge, onSave, onCancel }: {
  badge: BadgeRow
  onSave: (patch: { name: string; description: string; iconFile: File | null; cardFile: File | null; removeCard: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(badge.name)
  const [description, setDescription] = useState(badge.description)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [hasCard, setHasCard] = useState(!!badge.card_image_url)
  const [cardFile, setCardFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const removeCard = !hasCard && !!badge.card_image_url
  const cardPreview = cardFile ? URL.createObjectURL(cardFile) : (hasCard ? badge.card_image_url : null)

  async function save() {
    setSaving(true)
    try {
      await onSave({ name, description, iconFile, cardFile, removeCard })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border-t border-[var(--border)] p-3 space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Name</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Description (shown on hover)</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Icon (leave blank to keep current)</label>
          <input type="file" accept="image/*" onChange={e => setIconFile(e.target.files?.[0] ?? null)}
            className="text-xs text-[var(--text-2)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--surface-2)] file:text-[var(--text-1)] hover:file:bg-[var(--surface-3)]" />
        </div>
      </div>

      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-1)] cursor-pointer">
          <input type="checkbox" checked={hasCard} onChange={e => setHasCard(e.target.checked)} className="accent-green-500" />
          <Sparkles size={13} className="text-[var(--green)]" />
          Also show as a card in profile Achievements
        </label>
        {hasCard && (
          <div className="flex items-center gap-3 pl-6">
            {cardPreview && <SafeImage src={cardPreview} alt="" className="w-16 h-auto rounded border border-[var(--border)]" />}
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">
                {badge.card_image_url ? 'Replace card image' : 'Upload card image'}
              </label>
              <input type="file" accept="image/*" onChange={e => setCardFile(e.target.files?.[0] ?? null)}
                className="text-xs text-[var(--text-2)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-[var(--surface-2)] file:text-[var(--text-1)] hover:file:bg-[var(--surface-3)]" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !name.trim() || !description.trim() || (hasCard && !badge.card_image_url && !cardFile)}
          className="bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel} className="text-xs font-bold border border-[var(--border-2)] text-[var(--text-2)] hover:bg-[var(--surface-2)] px-4 py-2 rounded-xl transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

function BadgeMembersPanel({ badge, members, onAward, onRevoke, onAwardAll }: {
  badge: BadgeRow
  members: { user: BadgeMember | null }[]
  onAward: (badgeId: string, u: FoundUser) => void
  onRevoke: (badgeId: string, userId: string) => void
  onAwardAll: (badgeId: string) => void
}) {
  const [q, setQ] = useState('')
  // Browsable by default — loaded on open, not just after typing a search
  // query, so "who's around to award this to" is visible without having
  // to know a name first. Search (below) narrows this same list further.
  const [results, setResults] = useState<FoundUser[]>([])
  const [searching, setSearching] = useState(true)
  const supabase = createClient()
  const memberIds = new Set(members.map(m => m.user?.id).filter(Boolean))

  async function search(query: string) {
    setSearching(true)
    let req = supabase.from('users').select('id, username, display_name, avatar_url').order('username').limit(50)
    if (query.trim()) req = req.or(`username.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
    const { data } = await req
    setResults(data ?? [])
    setSearching(false)
  }

  useEffect(() => { search('') }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="border-t border-[var(--border)] p-3 space-y-3">
      <button onClick={() => onAwardAll(badge.id)}
        className="w-full flex items-center justify-center gap-1.5 bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-1)] text-xs font-bold px-3 py-2 rounded-lg transition-colors">
        <Users size={13} /> Award to All Members
      </button>
      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(q)}
          placeholder="Search to narrow the list…"
          className="flex-1 bg-[var(--surface-2)] border border-[var(--border-2)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)]" />
        <button onClick={() => search(q)} disabled={searching}
          className="bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--text-1)] text-xs font-bold px-3 rounded-lg transition-colors disabled:opacity-40">
          Search
        </button>
      </div>
      {searching && results.length === 0 && <p className="text-xs text-[var(--text-3)] text-center py-2">Loading members…</p>}
      {results.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {results.map(u => (
            <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)]">
              <div className="w-7 h-7 rounded-full bg-[var(--surface-3)] shrink-0 overflow-hidden flex items-center justify-center text-[12px] font-bold text-[var(--text-1)]">
                {u.avatar_url ? <SafeImage src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username)[0].toUpperCase()}
              </div>
              <span className="text-sm text-[var(--text-1)] flex-1 truncate">{u.display_name || u.username} <span className="text-[var(--text-3)]">@{u.username}</span></span>
              <button onClick={() => onAward(badge.id, u)} disabled={memberIds.has(u.id)}
                className="flex items-center gap-1 text-xs font-bold bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] disabled:bg-[var(--surface-3)] disabled:text-[var(--accent-fg)] text-[var(--accent-fg)] px-2.5 py-1 rounded-lg transition-colors shrink-0">
                <UserPlus size={11} /> {memberIds.has(u.id) ? 'Has it' : 'Award'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="text-[12px] font-bold text-[var(--text-3)] uppercase tracking-wider mb-1.5">Currently has this badge</p>
        {members.length === 0 ? (
          <p className="text-xs text-[var(--text-3)]">No one yet.</p>
        ) : (
          <div className="space-y-1">
            {members.map(m => m.user && (
              <div key={m.user.id} className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[color-mix(in_srgb,var(--surface-2)_60%,transparent)]">
                <div className="w-6 h-6 rounded-full bg-[var(--surface-3)] shrink-0 overflow-hidden flex items-center justify-center text-[11px] font-bold text-[var(--text-1)]">
                  {m.user.avatar_url ? <SafeImage src={m.user.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.user.display_name || m.user.username)[0].toUpperCase()}
                </div>
                <span className="text-xs text-[var(--text-2)] flex-1 truncate">@{m.user.username}</span>
                <button type="button" onClick={() => onRevoke(badge.id, m.user!.id)} className="text-[var(--text-3)] hover:text-[var(--red)] shrink-0" aria-label={`Revoke ${badge.name} from ${m.user!.display_name || m.user!.username}`}>
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
