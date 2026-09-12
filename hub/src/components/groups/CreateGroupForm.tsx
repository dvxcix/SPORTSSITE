'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { sportLogoUrl } from '@/lib/sportLogos'
import { Switch } from '@/components/ui/Switch'
import Image from 'next/image'
import { ArrowRight, Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { uploadMedia } from '@/lib/uploadMedia'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'General']
const EMOJIS = ['👥', '🏆', '🔥', '⚡', '🎯', '💰', '🎲', '🏈', '⚾', '🏀', '🏒', '⚽', '🥊', '🎉', '💎', '🚀', '👑', '🦁', '🎰']

type CreatorProduct = { id: string; title: string; price: number; currency: string }

export function CreateGroupForm({ products = [] }: { products?: CreatorProduct[] }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({ name: '', description: '', sport: '', emoji: '👥', is_public: true })
  const [creatorProductId, setCreatorProductId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : '', [avatarFile])
  const bannerPreview = useMemo(() => bannerFile ? URL.createObjectURL(bannerFile) : '', [bannerFile])
  useEffect(() => () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
  }, [avatarPreview, bannerPreview])

  function slug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!form.name.trim()) { setError('Group name is required'); return }
    setSubmitting(true)
    setError('')
    const groupSlug = slug(form.name.trim())
    if (!groupSlug) { setError('Use at least one letter or number in the group name'); setSubmitting(false); return }
    const { data, error: err } = await supabase.rpc('create_community_group', {
      p_name: form.name.trim(),
      p_slug: groupSlug,
      p_description: form.description.trim() || null,
      p_sport: form.sport || null,
      p_emoji: form.emoji,
      p_is_public: form.is_public,
      p_creator_product_id: creatorProductId || null,
    })
    if (err) {
      setError(err.code === '23505' ? 'That group name is already taken.' : 'The group could not be created. Try again.')
      setSubmitting(false)
      return
    }
    const created = Array.isArray(data) ? data[0] : data
    if (!created?.group_slug) {
      setError('The group could not be created. Try again.')
      setSubmitting(false)
      return
    }
    if (avatarFile || bannerFile) {
      const [avatar, banner] = await Promise.all([
        avatarFile ? uploadMedia(avatarFile, 'avatars') : Promise.resolve(null),
        bannerFile ? uploadMedia(bannerFile, 'banners') : Promise.resolve(null),
      ])
      if ((avatar && 'error' in avatar) || (banner && 'error' in banner)) {
        setError('The group was created, but one of its images could not be uploaded. You can retry in group settings.')
      } else {
        await supabase.rpc('update_community_group', {
          p_group_id: created.group_id,
          p_name: form.name.trim(),
          p_description: form.description.trim() || null,
          p_sport: form.sport || null,
          p_avatar_url: avatar && 'publicUrl' in avatar ? avatar.publicUrl : null,
          p_banner_url: banner && 'publicUrl' in banner ? banner.publicUrl : null,
          p_is_public: form.is_public,
        })
      }
    }
    router.push(`/groups/${created.group_slug}?setup=community`)
    router.refresh()
  }

  return (
    <form className="ss-flow-form" onSubmit={create}>
      {error && <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <section className="ss-flow-card">
        <div>
          <label>Community identity</label>
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]">
            <label className="relative flex h-28 cursor-pointer items-center justify-center overflow-hidden bg-gradient-to-br from-lime-400/15 via-cyan-400/5 to-transparent">
              {bannerPreview ? <Image src={bannerPreview} alt="Banner preview" fill unoptimized className="object-cover" /> : <span className="flex items-center gap-2 text-xs font-bold text-zinc-400"><ImagePlus size={16} /> Add banner</span>}
              <input className="sr-only" type="file" accept="image/*" onChange={event => setBannerFile(event.target.files?.[0] ?? null)} />
            </label>
            <label className="absolute bottom-3 left-4 grid h-16 w-16 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-[var(--surface)] bg-[var(--surface-3)] text-2xl shadow-xl">
              {avatarPreview ? <Image src={avatarPreview} alt="Group avatar preview" fill unoptimized className="object-cover" /> : <><span>{form.emoji}</span><Camera size={14} className="absolute bottom-1 right-1 rounded-full bg-black/70 p-0.5 text-white" /></>}
              <input className="sr-only" type="file" accept="image/*" onChange={event => setAvatarFile(event.target.files?.[0] ?? null)} />
            </label>
            {(avatarFile || bannerFile) && <button type="button" aria-label="Clear selected group images" onClick={() => { setAvatarFile(null); setBannerFile(null) }} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-white"><X size={14} /></button>}
            <div className="h-8" />
          </div>
        </div>
        <div>
          <label>Group name <span>*</span></label>
          <input aria-label="Group name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Yankees Nation, Parlay Kings…"
            maxLength={60} className="ss-flow-input" />
        </div>
        <div>
          <label>Description</label>
          <textarea aria-label="Group description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="What is this group about?"
            rows={4} maxLength={280} className="ss-flow-input resize-none" />
        </div>
        <div>
          <label>Icon</label>
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
          <label>Sport category</label>
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
        {products.length > 0 && <div>
          <label>Member access</label>
          <select aria-label="Group member access" value={creatorProductId} onChange={event => setCreatorProductId(event.target.value)} className="ss-flow-input">
            <option value="">Free group</option>
            {products.map(product => <option key={product.id} value={product.id}>{product.title} · {product.currency.toUpperCase()} {Number(product.price).toFixed(2)}</option>)}
          </select>
          <p className="text-xs text-zinc-500 mt-1.5">Paid groups are available only to members with an active entitlement.</p>
        </div>}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Public group</p>
            <p className="text-xs text-zinc-500">Anyone can find and join</p>
          </div>
          <Switch checked={form.is_public} onChange={checked => setForm(f => ({ ...f, is_public: checked }))} ariaLabel="Public group" />
        </div>
      </section>

      <button type="submit" disabled={submitting || !form.name.trim()}
        className="ss-flow-submit">
        {submitting ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : <>Create group <ArrowRight size={16} /></>}
      </button>
    </form>
  )
}
