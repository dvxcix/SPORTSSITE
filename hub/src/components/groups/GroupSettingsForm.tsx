'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

export function GroupSettingsForm({ group }: { group: any }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    name: group.name ?? '',
    description: group.description ?? '',
    sport: group.sport ?? '',
    avatar_url: group.avatar_url ?? '',
    banner_url: group.banner_url ?? '',
    is_public: group.is_public ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function save() {
    if (!form.name.trim()) { setError('Group name is required'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.from('groups').update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      sport: form.sport || null,
      avatar_url: form.avatar_url.trim() || null,
      banner_url: form.banner_url.trim() || null,
      is_public: form.is_public,
    }).eq('id', group.id)
    if (err) { setError(err.message); setSaving(false); return }
    // The chat channel's own channel_type gates who can read it at all
    // (see the RLS policy) — it has to track the group's own visibility,
    // or a group flipped to private would still have a publicly-readable
    // channel left over from when it was created public.
    if (group.channel_id && form.is_public !== group.is_public) {
      await supabase.from('channels').update({ channel_type: form.is_public ? 'public' : 'members_only' }).eq('id', group.channel_id)
    }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function deleteGroup() {
    setDeleting(true); setError('')
    const { error: err } = await supabase.from('groups').delete().eq('id', group.id)
    if (err) { setError(err.message); setDeleting(false); return }
    router.push('/groups')
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Group Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Description</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.map(s => {
              const logo = sportLogoUrl(s)
              return (
                <button key={s} type="button" onClick={() => setForm(f => ({ ...f, sport: s === 'General' ? '' : s }))}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    (form.sport === s || (s === 'General' && !form.sport))
                      ? 'border-green-500 bg-green-500/10 text-green-400'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                  }`}>
                  {logo && <img src={logo} alt="" className="w-3.5 h-3.5 object-contain" />}
                  {s}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Avatar Image URL</label>
          <input value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Banner Image URL</label>
          <input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Public group</p>
            <p className="text-xs text-zinc-500">Anyone can find and join without an invite</p>
          </div>
          <button type="button" onClick={() => setForm(f => ({ ...f, is_public: !f.is_public }))}
            style={{ width: '40px', height: '22px', background: form.is_public ? '#22c55e' : '#3f3f46', borderRadius: '11px', position: 'relative', transition: 'background 0.15s' }}>
            <span style={{ position: 'absolute', top: '2px', width: '18px', height: '18px', background: 'white', borderRadius: '50%', transition: 'transform 0.15s', transform: form.is_public ? 'translateX(18px)' : 'translateX(2px)' }} />
          </button>
        </div>
      </div>

      <button onClick={save} disabled={saving || !form.name.trim()}
        className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-3 rounded-xl transition-colors">
        {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : 'Save Changes'}
      </button>

      <div className="bg-zinc-900 border border-red-500/20 rounded-xl p-4">
        <h3 className="font-bold text-red-400 mb-2">Danger Zone</h3>
        <p className="text-xs text-zinc-500 mb-3">Permanently delete this group and all its posts. This cannot be undone.</p>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button onClick={deleteGroup} disabled={deleting} className="bg-red-500 hover:bg-red-400 disabled:opacity-40 text-black font-black px-4 py-2 rounded-xl text-sm transition-colors">
              {deleting ? 'Deleting…' : 'Yes, delete this group'}
            </button>
            <button onClick={() => setConfirmingDelete(false)} className="text-zinc-400 hover:text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmingDelete(true)} className="border border-red-500/50 text-red-400 hover:bg-red-500/10 font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            Delete Group
          </button>
        )}
      </div>
    </div>
  )
}
