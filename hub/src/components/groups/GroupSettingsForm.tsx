'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'
import { Switch } from '@/components/ui/Switch'
import Image from 'next/image'
import { Loader2, Save, Trash2 } from 'lucide-react'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

export function GroupSettingsForm({ group }: { group: any }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
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

  const inputClass = 'ss-flow-input'

  return (
    <div className="ss-flow-form">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <section className="ss-flow-card">
        <div>
          <label>Group name <span>*</span></label>
          <input value={form.name} maxLength={60} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label>Description</label>
          <textarea value={form.description} maxLength={280} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label>Sport</label>
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
                  {logo && <Image src={logo} alt="" width={14} height={14} />}
                  {s}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label>Avatar image URL</label>
          <input value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div>
          <label>Banner image URL</label>
          <input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Public group</p>
            <p className="text-xs text-zinc-500">Anyone can find and join without an invite</p>
          </div>
          <Switch checked={form.is_public} onChange={checked => setForm(f => ({ ...f, is_public: checked }))} ariaLabel="Public group" />
        </div>
      </section>

      <button onClick={save} disabled={saving || !form.name.trim()}
        className="ss-flow-submit">
        {saved ? <><Check size={15} /> Saved</> : saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save changes</>}
      </button>

      <section className="ss-danger-card">
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
            <Trash2 size={14} /> Delete group
          </button>
        )}
      </section>
    </div>
  )
}
