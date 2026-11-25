'use client'

import { memberTone } from '@/lib/memberIdentity'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AtSign, Check, ChevronRight, Loader2, Upload } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { sportLogoUrl } from '@/lib/sportLogos'
import { SafeImage } from '@/components/ui/SafeImage'
import { FavoritePicker } from '@/components/profile/FavoritePicker'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'
import { normalizeFavoritePlayers } from '@/lib/sportFavorites'
import { MemberAvatar, type MemberRingStyle } from '@/components/social/MemberAvatar'
import { AvatarStylePicker } from './AvatarStylePicker'
import { avatarDecoration, avatarStyleName, isAvatarStyle } from '@/lib/avatarStyles'
import { PROFILE_SPORTSBOOKS } from '@/lib/profileSportsbooks'
import { useAuth } from '@/context/AuthContext'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Golf', 'Tennis', 'Boxing', 'College Football', 'College Basketball']

function isSafeHttpUrl(value: string) {
  if (!value.trim()) return true
  try { return ['http:', 'https:'].includes(new URL(value.trim()).protocol) } catch { return false }
}


type SocialPlatform = { id: string; key: string; name: string; icon_url: string; url_template: string | null }

export function ProfileForm({ profile }: { profile: any }) {
  const router = useRouter()
  const { refreshProfile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? '',
    username: profile?.username ?? '',
    bio: profile?.bio ?? '',
    location: profile?.location ?? '',
    website: profile?.website ?? '',
    avatar_url: profile?.avatar_url ?? '',
    banner_url: profile?.banner_url ?? '',
    avatar_ring_style: (profile?.avatar_ring_style ?? 'surge') as MemberRingStyle,
    avatar_ring_color: profile?.avatar_ring_color ?? '#b6ff3b',
    favorite_sports: (profile?.favorite_sports ?? []) as string[],
    favorite_teams: (profile?.favorite_teams ?? []) as string[],
    favorite_players: normalizeFavoritePlayers(profile?.favorite_players),
    social_links: (profile?.social_links ?? {}) as Record<string, string>,
    sportsbooks: (profile?.sportsbooks ?? []) as string[],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const [platforms, setPlatforms] = useState<SocialPlatform[]>([])
  useEffect(() => {
    supabase.from('social_platforms').select('*').order('sort_order').order('name')
      .then(({ data }) => setPlatforms((data ?? []) as SocialPlatform[]))
  }, [supabase])

  async function uploadImage(file: File, kind: 'avatar' | 'banner') {
    setError('')
    setUploading(kind)
    try {
      const result = await uploadMedia(file, `${kind}s`)
      if ('error' in result) { setError(result.error); return }
      setForm(f => ({ ...f, [`${kind}_url`]: result.publicUrl }))
    } catch (e: any) {
      setError(e?.message || 'Upload failed — please try again.')
    } finally {
      setUploading(null)
    }
  }

  function toggleSport(s: string) {
    setForm(f => ({
      ...f,
      favorite_sports: f.favorite_sports.includes(s)
        ? f.favorite_sports.filter(x => x !== s)
        : [...f.favorite_sports, s],
    }))
  }

  function toggleSportsbook(key: string) {
    setForm(f => ({
      ...f,
      sportsbooks: f.sportsbooks.includes(key)
        ? f.sportsbooks.filter(x => x !== key)
        : [...f.sportsbooks, key],
    }))
  }

  function setSocialLink(platformKey: string, handle: string) {
    setForm(f => {
      const next = { ...f.social_links }
      if (handle.trim()) next[platformKey] = handle.trim()
      else delete next[platformKey]
      return { ...f, social_links: next }
    })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true); setError('')
    try {
      const username = form.username.trim().toLowerCase().replace(/\s/g, '')
      if (username.length < 2 || username.length > 30 || !/^[a-z0-9._]+$/.test(username)) { setError('Use 2–30 letters, numbers, periods, or underscores for your username.'); return }
      if (!isSafeHttpUrl(form.website) || !isSafeHttpUrl(form.avatar_url) || !isSafeHttpUrl(form.banner_url)) { setError('Website and image links must begin with https://'); return }
      if (!isAvatarStyle(form.avatar_ring_style) || !/^#[0-9a-f]{6}$/i.test(form.avatar_ring_color)) { setError('Choose a valid avatar style and color.'); return }

      const { error: err } = await supabase.from('users').update({
        display_name: form.display_name.trim() || null,
        username,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        banner_url: form.banner_url.trim() || null,
        avatar_ring_style: form.avatar_ring_style,
        avatar_ring_color: form.avatar_ring_color,
        social_links: form.social_links,
        sportsbooks: form.sportsbooks,
      }).eq('id', profile.id)
      if (err) { setError('Your profile could not be saved. Try again.'); return }
      void refreshProfile()
      const favoritesResponse = await fetch('/api/account/favorites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams: form.favorite_teams, players: form.favorite_players, sports: form.favorite_sports }) }).catch(() => null)
      if (!favoritesResponse?.ok) { setError('Your profile was saved, but favorites could not be saved. Please try again.'); return }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch {
      setError('Your profile could not be saved. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-[var(--surface-2)] border border-[var(--border-2)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)] outline-none focus:border-[color-mix(in_srgb,var(--green)_50%,transparent)] transition-all"
  const completionItems = [form.avatar_url, form.banner_url, form.display_name, form.bio, form.location, form.website, form.favorite_teams.length, form.favorite_players.length]
  const completion = Math.round((completionItems.filter(Boolean).length / completionItems.length) * 100)

  return (
    <form className="space-y-6" onSubmit={save}>
      {error && <div role="alert" className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{error}</div>}

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-[var(--text-1)]">Profile completion</h2><strong className="text-sm font-semibold tabular-nums text-[var(--text-1)]">{completion}%</strong></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-3)]" role="progressbar" aria-label="Profile completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><div className="h-full rounded-full bg-[var(--accent-fill)]" style={{ width: `${completion}%` }} /></div>
      </section>

      <section className="ss-profile-editor-preview">
        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'avatar'); e.target.value = '' }} />
        <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'banner'); e.target.value = '' }} />
        <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploading === 'banner'} className="ss-profile-editor-banner" aria-label="Change profile banner">
          {form.banner_url ? <SafeImage src={form.banner_url} alt="" /> : <span>Add a cover photo</span>}
          <span className="ss-profile-editor-upload">{uploading === 'banner' ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} />} Change banner</span>
        </button>
        <div className="ss-profile-editor-identity">
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading === 'avatar'} className="ss-profile-editor-avatar" aria-label="Change profile picture">
            {form.avatar_url ? <SafeImage src={form.avatar_url} alt="" /> : (form.display_name || form.username || '?')[0]?.toUpperCase()}
            <span>{uploading === 'avatar' ? <Loader2 size={19} className="animate-spin" /> : <Upload size={19} />}</span>
          </button>
          <div>
            <strong>{form.display_name || 'Your display name'}</strong>
            <span>@{form.username || 'username'}</span>
            <p>{form.bio || 'Your bio and identity will preview here as you edit.'}</p>
          </div>
        </div>
        <details className="ss-profile-editor-links"><summary>Use image URLs instead</summary><div><input type="url" aria-label="Avatar image URL" value={form.avatar_url} maxLength={500} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="Avatar URL" className={inputClass} /><input type="url" aria-label="Banner image URL" value={form.banner_url} maxLength={500} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="Banner URL" className={inputClass} /></div></details>
      </section>

      <section className="ss-profile-ring-editor">
        <div className="ss-avatar-style-summary">
        <div className="ss-profile-ring-preview">
          <MemberAvatar
            src={form.avatar_url}
            name={form.display_name || form.username || 'You'}
            size={72}
            tone={memberTone(profile)}
            ringStyle={form.avatar_ring_style}
            ringColor={form.avatar_ring_color}
          />
          <div><strong>Avatar style</strong><span>{avatarStyleName(form.avatar_ring_style)}</span></div>
        </div>
        <AvatarStylePicker value={form.avatar_ring_style} onChange={style => setForm(current => ({ ...current, avatar_ring_style: style }))} src={form.avatar_url} name={form.display_name || form.username || 'You'} color={form.avatar_ring_color} />
        </div>
        {!avatarDecoration(form.avatar_ring_style) && <div className="ss-profile-ring-colors">
          {['#b6ff3b', '#39d9ff', '#a855f7', '#ff4d6a', '#f8c15c', '#ffffff'].map(color => (
            <button key={color} type="button" aria-label={`Use ${color} profile ring`} aria-pressed={form.avatar_ring_color === color}
              className={form.avatar_ring_color === color ? 'is-active' : ''}
              style={{ '--ring-swatch': color } as React.CSSProperties}
              onClick={() => setForm(current => ({ ...current, avatar_ring_color: color }))} />
          ))}
          <label className="ss-profile-ring-custom">Custom <input type="color" value={form.avatar_ring_color}
            onChange={event => setForm(current => ({ ...current, avatar_ring_color: event.target.value }))} /></label>
        </div>}
      </section>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Display Name</label>
          <input aria-label="Display name" value={form.display_name} maxLength={60} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Your name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Username</label>
          <input aria-label="Username" value={form.username} maxLength={30} autoCapitalize="none" spellCheck={false} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="username" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Bio</label>
        <textarea aria-label="Bio" value={form.bio} maxLength={280} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} placeholder="Tell people who you are…" className={inputClass + ' resize-none'} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Location</label>
          <input aria-label="Location" value={form.location} maxLength={80} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, State" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Website</label>
          <input type="url" aria-label="Website" value={form.website} maxLength={500} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Favorite Sports</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.filter(s => !MLB_HIBERNATING || profile?.account_type === 'admin' || s !== 'MLB').map(s => {
            const logo = sportLogoUrl(s)
            return (
              <button key={s} type="button" aria-pressed={form.favorite_sports.includes(s)} onClick={() => toggleSport(s)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.favorite_sports.includes(s) ? 'border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : 'border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-2)]'}`}>
                {form.favorite_sports.includes(s) && <Check size={10} />}
                {logo && <SafeImage src={logo} alt="" className="w-3.5 h-3.5 object-contain" />}
                {s}
              </button>
            )
          })}
        </div>
      </div>

      <FavoritePicker teams={form.favorite_teams} players={form.favorite_players} sports={form.favorite_sports} allowNba={true} onTeamsChange={teams => setForm(current => ({ ...current, favorite_teams: teams }))} onPlayersChange={players => setForm(current => ({ ...current, favorite_players: players }))}/>

      <div>
        <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Sportsbooks You Use</label>
        <div className="flex flex-wrap gap-2">
          {PROFILE_SPORTSBOOKS.map(b => (
            <button key={b.key} type="button" aria-pressed={form.sportsbooks.includes(b.key)} onClick={() => toggleSportsbook(b.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.sportsbooks.includes(b.key) ? 'border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)] text-[var(--green)]' : 'border-[var(--border-2)] text-[var(--text-3)] hover:border-[var(--border-2)]'}`}>
              <BookLogo vendor={b.key} size={14} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <Link href="/settings/connections" className="ss-profile-connections-link">
        <span><AtSign size={18} /></span>
        <div><strong>Connected accounts</strong><small>Connect or manage Whop, Discord, and X</small></div>
        <ChevronRight size={16} />
      </Link>

      {platforms.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-[var(--text-2)] mb-2">Public social links</label>
          <div className="space-y-2">
            {platforms.map(p => {
              return (
                <div key={p.id} className="flex items-center gap-2.5">
                  <SafeImage src={p.icon_url} alt={p.name} className="w-6 h-6 object-contain shrink-0" />
                  <input
                    aria-label={`${p.name} handle or username`}
                    value={form.social_links[p.key] ?? ''}
                    onChange={e => setSocialLink(p.key, e.target.value)}
                    placeholder={`Your ${p.name} handle/username…`}
                    maxLength={100}
                    className={inputClass}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="ss-profile-savebar"><span>Changes apply after saving.</span><button type="submit" disabled={saving || !!uploading}
        className={`w-full flex items-center justify-center gap-2 font-semibold py-3 rounded-xl transition-all ${saved ? 'bg-[var(--green-fill)] text-[var(--on-status)]' : 'bg-[var(--accent-fill)] hover:bg-[var(--accent-fill)] text-[var(--accent-fg)]'} disabled:opacity-60`}>
        {saved ? <><Check size={16} /> Saved!</> : saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save Profile'}
      </button></div>
    </form>
  )
}
