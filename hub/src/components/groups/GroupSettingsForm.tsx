'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Camera, Check, ImagePlus, Loader2, Save, Trash2 } from 'lucide-react'
import { uploadMedia } from '@/lib/uploadMedia'
import { sportLogoUrl } from '@/lib/sportLogos'
import { Switch } from '@/components/ui/Switch'
import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']

type EditableGroup = {
  id: string
  name?: string | null
  description?: string | null
  rules?: string | null
  sport?: string | null
  avatar_url?: string | null
  banner_url?: string | null
  is_public?: boolean | null
  access_type?: string | null
}

export function GroupSettingsForm({ group, showDangerZone = true }: { group: EditableGroup; showDangerZone?: boolean }) {
  const { profile } = useAuth()
  const showMlb = !MLB_HIBERNATING || profile?.account_type === 'admin'
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({
    name: group.name ?? '',
    description: group.description ?? '',
    rules: group.rules ?? '',
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
  const [uploading, setUploading] = useState<'avatar' | 'banner' | ''>('')

  async function selectImage(kind: 'avatar' | 'banner', file?: File) {
    if (!file) return
    setUploading(kind); setError('')
    try {
      const result = await uploadMedia(file, kind === 'avatar' ? 'avatars' : 'banners')
      if ('error' in result) setError(result.error)
      else { setForm(current => ({ ...current, [kind === 'avatar' ? 'avatar_url' : 'banner_url']: result.publicUrl })); setSaved(false) }
    } catch { setError('Image could not be uploaded. Try again.') }
    finally { setUploading('') }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (form.name.trim().length < 2) { setError('Group name must be at least 2 characters'); return }
    setSaving(true); setError('')
    const { error: err } = await supabase.rpc('update_community_group', {
      p_group_id: group.id,
      p_name: form.name.trim(),
      p_description: form.description.trim() || null,
      p_sport: form.sport || null,
      p_avatar_url: form.avatar_url.trim() || null,
      p_banner_url: form.banner_url.trim() || null,
      p_is_public: form.is_public,
    })
    if (err) { setError('The group could not be saved. Try again.'); setSaving(false); return }
    const { error: rulesError } = await supabase.rpc('set_community_group_rules', {
      p_group_id: group.id,
      p_rules: form.rules.trim() || null,
    })
    if (rulesError) { setError('The community rules could not be saved. Try again.'); setSaving(false); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function deleteGroup() {
    setDeleting(true); setError('')
    const { error: err } = await supabase.from('groups').delete().eq('id', group.id)
    if (err) { setError('The group could not be deleted. Try again.'); setDeleting(false); return }
    router.push('/groups')
  }

  const inputClass = 'ss-flow-input'

  return (
    <form className="ss-flow-form" onSubmit={save}>
      {error && <div role="alert" className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}

      <section className="ss-flow-card">
        <div>
          <label>Group name <span>*</span></label>
          <input aria-label="Group name" value={form.name} maxLength={60} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label>Description</label>
          <textarea aria-label="Group description" value={form.description} maxLength={280} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} className={inputClass + ' resize-none'} />
        </div>
        <div>
          <label>Community rules</label>
          <textarea aria-label="Community rules" value={form.rules} maxLength={4000} onChange={e => setForm(f => ({ ...f, rules: e.target.value }))} rows={7} className={inputClass + ' resize-y'} placeholder="Add the rules members accept when they join." />
          <p className="mt-1 text-right text-[12px] text-[var(--text-3)]">{form.rules.length}/4000</p>
        </div>
        <div>
          <label>Sport</label>
          <div className="flex flex-wrap gap-1.5">
            {SPORTS.filter(s => showMlb || s !== 'MLB').map(s => {
              const logo = sportLogoUrl(s)
              return (
                <button key={s} type="button" aria-pressed={form.sport === s || (s === 'General' && !form.sport)} onClick={() => setForm(f => ({ ...f, sport: s === 'General' ? '' : s }))}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    (form.sport === s || (s === 'General' && !form.sport))
                      ? 'border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]'
                      : 'border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-2)]'
                  }`}>
                  {logo && <Image src={logo} alt="" width={14} height={14} />}
                  {s}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label>Community appearance</label>
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
            <label className="relative flex h-32 cursor-pointer items-center justify-center overflow-hidden bg-gradient-to-br from-lime-400/15 via-cyan-400/5 to-transparent">
              {form.banner_url ? <Image src={form.banner_url} alt="Community banner" fill unoptimized className="object-cover" /> : <span className="flex items-center gap-2 text-xs font-bold text-[var(--text-2)]"><ImagePlus size={16} /> Add banner</span>}
              {uploading === 'banner' && <span className="absolute inset-0 grid place-items-center bg-[var(--overlay)]"><Loader2 size={18} className="animate-spin" /></span>}
              <input className="sr-only" type="file" aria-label="Change community banner" accept="image/*" onChange={event => selectImage('banner', event.target.files?.[0])} />
            </label>
            <label className="absolute bottom-4 left-5 grid h-20 w-20 cursor-pointer place-items-center overflow-hidden rounded-2xl border-4 border-[var(--surface)] bg-[var(--surface-3)] text-[var(--text-2)] shadow-xl">
              {form.avatar_url ? <Image src={form.avatar_url} alt="Community avatar" fill unoptimized className="object-cover" /> : <Camera size={22} />}
              {uploading === 'avatar' && <span className="absolute inset-0 grid place-items-center bg-[var(--overlay)]"><Loader2 size={18} className="animate-spin" /></span>}
              <input className="sr-only" type="file" aria-label="Change community avatar" accept="image/*" onChange={event => selectImage('avatar', event.target.files?.[0])} />
            </label>
            <div className="h-11" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">{group.access_type === 'paid' ? 'Member community' : 'Public group'}</p>
            <p className="text-xs text-[var(--text-3)]">{group.access_type === 'paid' ? 'Access follows the linked Whop membership.' : 'Anyone can find and join without an invite'}</p>
          </div>
          {group.access_type !== 'paid' && <Switch checked={form.is_public} onChange={checked => setForm(f => ({ ...f, is_public: checked }))} ariaLabel="Public group" />}
        </div>
      </section>

      <button type="submit" disabled={saving || form.name.trim().length < 2}
        className="ss-flow-submit">
        {saved ? <><Check size={15} /> Saved</> : saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : <><Save size={16} /> Save changes</>}
      </button>

      {showDangerZone&&<section className="ss-danger-card">
        <h3 className="font-bold text-[var(--red)] mb-2">Danger Zone</h3>
        <p className="text-xs text-[var(--text-3)] mb-3">Permanently delete this group and all its posts. This cannot be undone.</p>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={deleteGroup} disabled={deleting} className="bg-[var(--red-fill)] hover:bg-[var(--red-fill)] disabled:opacity-40 text-[var(--accent-fg)] font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
              {deleting ? 'Deleting…' : 'Yes, delete this group'}
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="text-[var(--text-2)] hover:text-[var(--text-1)] font-bold px-4 py-2 rounded-xl text-sm transition-colors">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)} className="border border-[color-mix(in_srgb,var(--red)_50%,transparent)] text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_10%,transparent)] font-bold px-4 py-2 rounded-xl text-sm transition-colors">
            <Trash2 size={14} /> Delete group
          </button>
        )}
      </section>}
    </form>
  )
}
