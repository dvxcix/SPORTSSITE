'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']
const EMOJIS = ['👥', '🏆', '🔥', '⚡', '🎯', '💰', '🎲', '🏈', '⚾', '🏀', '🏒', '⚽', '🥊', '🎉', '💎', '🚀', '👑', '🦁', '🎰']

export function CreateGroupForm({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ name: '', description: '', sport: '', emoji: '👥', is_public: true })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function create() {
    if (!form.name.trim()) { setError('Group name is required'); return }
    setSubmitting(true)
    setError('')
    const groupSlug = slug(form.name.trim())
    const { data, error: err } = await supabase.from('groups').insert({
      name: form.name.trim(),
      slug: groupSlug,
      description: form.description.trim() || null,
      sport: form.sport || null,
      emoji: form.emoji,
      is_public: form.is_public,
      owner_id: userId,
      // Not member_count: 1 here — the group_members insert right below
      // fires the count-sync trigger, which would double it to 2.
    }).select('id, slug').single()
    if (err) { setError(err.message); setSubmitting(false); return }
    if (data?.id) {
      await supabase.from('group_members').insert({ group_id: data.id, user_id: userId, role: 'owner' })

      // Every group gets a chat channel — reuses the existing channels/
      // messages/realtime infra rather than building a parallel chat
      // system. channel_type gates who can even SELECT it (see the RLS
      // policy): 'public' for a public group's chat (readable by anyone,
      // matching the group's own openness), 'members_only' for a private
      // group so non-members can't read the channel at all.
      const { data: channel } = await supabase.from('channels').insert({
        name: form.name.trim(),
        slug: `group-${groupSlug}`,
        description: form.description.trim() || null,
        icon: form.emoji,
        channel_type: form.is_public ? 'public' : 'members_only',
        owner_id: userId,
        member_count: 1,
      }).select('id').single()
      if (channel?.id) {
        await supabase.from('channel_members').insert({ channel_id: channel.id, user_id: userId })
        await supabase.from('groups').update({ channel_id: channel.id }).eq('id', data.id)
      }
    }
    router.push(`/groups/${data?.slug}`)
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Group Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Yankees Nation, Parlay Kings…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What is this group about?"
            rows={3}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all resize-none" />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Icon</label>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))}
                className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg border transition-all ${
                  form.emoji === e ? 'border-green-500 bg-green-500/10' : 'border-zinc-700 hover:border-zinc-600'
                }`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport Category</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map(s => (
              <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s === 'General' ? '' : s }))}
                className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                  (form.sport === s || (s === 'General' && !form.sport))
                    ? 'border-green-500 bg-green-500/10 text-green-400'
                    : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Public group</p>
            <p className="text-xs text-zinc-500">Anyone can find and join</p>
          </div>
          <button type="button" onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))}
            style={{ width: '40px', height: '22px', background: form.is_public ? '#22c55e' : '#3f3f46', borderRadius: '11px', position: 'relative', transition: 'background 0.15s' }}>
            <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.15s', transform: form.is_public ? 'translateX(18px)' : 'translateX(2px)' }} />
          </button>
        </div>
      </div>

      <button onClick={create} disabled={submitting || !form.name.trim()}
        className="w-full bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {submitting ? 'Creating…' : 'Create Group'}
      </button>
    </div>
  )
}
