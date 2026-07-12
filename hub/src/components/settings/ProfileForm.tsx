'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Upload, X, Search } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { MLB_TEAMS } from '@/lib/mlbTeams'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'
import { mlbHeadshot } from '@/lib/mlb-api'
import { mlbTeamAbbrById } from '@/lib/mlbTeams'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Golf', 'Tennis', 'Boxing', 'College Football', 'College Basketball']

// Matches BookLogo's own hardcoded BOOKS keys (not exported from there) —
// these are the only books this app can reliably show a real logo for
// (locally-hosted assets, not hotlinked favicons), so the picker is capped
// to this same set rather than letting someone type in an arbitrary book
// name that would just render as a gray initials fallback everywhere.
const SPORTSBOOKS = [
  { key: 'fanduel', label: 'FanDuel' },
  { key: 'draftkings', label: 'DraftKings' },
  { key: 'betmgm', label: 'BetMGM' },
  { key: 'caesars', label: 'Caesars' },
  { key: 'betrivers', label: 'BetRivers' },
  { key: 'pinnacle', label: 'Pinnacle' },
]

type SocialPlatform = { id: string; key: string; name: string; icon_url: string; url_template: string | null }
type FavoritePlayer = { mlb_id: number; name: string; team: string }
type PlayerSearchResult = { mlbId: number; name: string; position: string | null; teamId: number | null; teamName: string | null }

export function ProfileForm({ profile }: { profile: any }) {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({
    display_name: profile?.display_name ?? '',
    username: profile?.username ?? '',
    bio: profile?.bio ?? '',
    location: profile?.location ?? '',
    website: profile?.website ?? '',
    avatar_url: profile?.avatar_url ?? '',
    banner_url: profile?.banner_url ?? '',
    favorite_sports: (profile?.favorite_sports ?? []) as string[],
    favorite_teams: (profile?.favorite_teams ?? []) as string[],
    favorite_players: (profile?.favorite_players ?? []) as FavoritePlayer[],
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [playerQuery, setPlayerQuery] = useState('')
  const [playerResults, setPlayerResults] = useState<PlayerSearchResult[]>([])
  const [playerSearching, setPlayerSearching] = useState(false)
  useEffect(() => {
    if (playerQuery.trim().length < 2) { setPlayerResults([]); return }
    let cancelled = false
    setPlayerSearching(true)
    const t = setTimeout(() => {
      fetch(`/api/search/sports?q=${encodeURIComponent(playerQuery.trim())}`)
        .then(r => r.ok ? r.json() : { players: [] })
        .then(d => { if (!cancelled) setPlayerResults(d.players ?? []) })
        .finally(() => { if (!cancelled) setPlayerSearching(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [playerQuery])

  async function uploadImage(file: File, kind: 'avatar' | 'banner') {
    setError('')
    setUploading(kind)
    try {
      const path = `${kind}s/${profile.id}/${Date.now()}-${file.name}`
      const { error: uploadErr } = await supabase.storage.from('media').upload(path, file, { upsert: true })
      if (uploadErr) { setError(uploadErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(path)
      setForm(f => ({ ...f, [`${kind}_url`]: publicUrl }))
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

  function toggleTeam(abbr: string) {
    setForm(f => ({
      ...f,
      favorite_teams: f.favorite_teams.includes(abbr)
        ? f.favorite_teams.filter(x => x !== abbr)
        : [...f.favorite_teams, abbr],
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

  function addFavoritePlayer(p: PlayerSearchResult) {
    if (form.favorite_players.some(x => x.mlb_id === p.mlbId)) return
    if (form.favorite_players.length >= 8) { setError('Up to 8 favorite players.'); return }
    const team = mlbTeamAbbrById(p.teamId) ?? p.teamName ?? ''
    setForm(f => ({ ...f, favorite_players: [...f.favorite_players, { mlb_id: p.mlbId, name: p.name, team }] }))
    setPlayerQuery(''); setPlayerResults([])
  }

  function removeFavoritePlayer(mlbId: number) {
    setForm(f => ({ ...f, favorite_players: f.favorite_players.filter(x => x.mlb_id !== mlbId) }))
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const username = form.username.trim().toLowerCase().replace(/\s/g, '')
      if (!username) { setError('Username cannot be empty'); return }

      const { error: err } = await supabase.from('users').update({
        display_name: form.display_name.trim() || null,
        username,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
        website: form.website.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
        banner_url: form.banner_url.trim() || null,
        favorite_sports: form.favorite_sports,
        favorite_teams: form.favorite_teams,
        favorite_players: form.favorite_players,
        social_links: form.social_links,
        sportsbooks: form.sportsbooks,
      }).eq('id', profile.id)
      if (err) { setError(err.message); return }
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Something went wrong saving your profile — please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 transition-all"

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="flex items-center gap-5">
        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'avatar'); e.target.value = '' }} />
        <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading === 'avatar'}
          className="relative w-20 h-20 rounded-2xl bg-zinc-700 overflow-hidden flex items-center justify-center text-3xl shrink-0 group">
          {form.avatar_url ? <img src={form.avatar_url} alt="" className="w-full h-full object-cover" /> : (form.display_name || '?')[0]?.toUpperCase()}
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading === 'avatar' ? <Loader2 size={20} className="animate-spin text-white" /> : <Upload size={20} className="text-white" />}
          </div>
        </button>
        <div className="flex-1">
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Profile Picture</label>
          <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading === 'avatar'}
            className="text-sm font-bold text-green-400 hover:text-green-300 transition-colors disabled:opacity-60">
            {uploading === 'avatar' ? 'Uploading…' : 'Upload image'}
          </button>
          <details className="mt-2">
            <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">Or paste an image URL instead</summary>
            <input value={form.avatar_url} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} placeholder="https://…" className={inputClass + ' mt-2'} />
          </details>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Banner</label>
        <input ref={bannerInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'banner'); e.target.value = '' }} />
        <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploading === 'banner'}
          className="relative w-full h-24 rounded-xl bg-zinc-700 overflow-hidden flex items-center justify-center group">
          {form.banner_url ? <img src={form.banner_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-zinc-500">No banner set</span>}
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
            {uploading === 'banner' ? <Loader2 size={20} className="animate-spin text-white" /> : <Upload size={20} className="text-white" />}
          </div>
        </button>
        <details className="mt-2">
          <summary className="text-xs text-zinc-600 cursor-pointer hover:text-zinc-400">Or paste an image URL instead</summary>
          <input value={form.banner_url} onChange={e => setForm(f => ({ ...f, banner_url: e.target.value }))} placeholder="https://…" className={inputClass + ' mt-2'} />
        </details>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Display Name</label>
          <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Your name" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Username</label>
          <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))} placeholder="username" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Bio</label>
        <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} rows={3} placeholder="Tell people who you are…" className={inputClass + ' resize-none'} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Location</label>
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, State" className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Website</label>
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" className={inputClass} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Favorite Sports</label>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map(s => (
            <button key={s} type="button" onClick={() => toggleSport(s)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.favorite_sports.includes(s) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
              {form.favorite_sports.includes(s) && <Check size={10} />}{s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Favorite Teams</label>
        <div className="flex flex-wrap gap-2">
          {MLB_TEAMS.map(t => (
            <button key={t.abbr} type="button" onClick={() => toggleTeam(t.abbr)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.favorite_teams.includes(t.abbr) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
              <img src={getTeamLogoUrl(t.abbr)} alt="" className="w-4 h-4 object-contain" />
              {t.shortName}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Favorite Players <span className="text-zinc-600 font-normal">(up to 8 — shows as a card linking to their Dugout page)</span></label>
        {form.favorite_players.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {form.favorite_players.map(p => (
              <div key={p.mlb_id} className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full pl-1.5 pr-2 py-1">
                <PlayerAvatar headshot={mlbHeadshot(p.mlb_id)} teamLogo={getTeamLogoUrl(p.team)} teamAbbr={p.team} name={p.name} size={24} />
                <span className="text-xs font-bold text-white">{p.name}</span>
                <button type="button" onClick={() => removeFavoritePlayer(p.mlb_id)} className="text-zinc-500 hover:text-red-400"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input value={playerQuery} onChange={e => setPlayerQuery(e.target.value)} placeholder="Search MLB players…"
            className={inputClass} style={{ paddingLeft: 32 }} />
          {(playerSearching || playerResults.length > 0) && playerQuery.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl">
              {playerSearching && playerResults.length === 0 ? (
                <p className="text-xs text-zinc-500 px-3 py-2">Searching…</p>
              ) : (
                playerResults.map(p => (
                  <button key={p.mlbId} type="button" onClick={() => addFavoritePlayer(p)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-zinc-700/60 text-left">
                    <PlayerAvatar headshot={mlbHeadshot(p.mlbId)} teamLogo={getTeamLogoUrl(mlbTeamAbbrById(p.teamId))} teamAbbr={mlbTeamAbbrById(p.teamId)} name={p.name} size={26} />
                    <span className="text-sm text-white flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-zinc-500">{p.position} · {p.teamName}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-zinc-400 mb-2">Sportsbooks You Use</label>
        <div className="flex flex-wrap gap-2">
          {SPORTSBOOKS.map(b => (
            <button key={b.key} type="button" onClick={() => toggleSportsbook(b.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.sportsbooks.includes(b.key) ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
              <BookLogo vendor={b.key} size={14} />
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {platforms.length > 0 && (
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Connected Accounts</label>
          <div className="space-y-2">
            {platforms.map(p => (
              <div key={p.id} className="flex items-center gap-2.5">
                <img src={p.icon_url} alt={p.name} className="w-6 h-6 object-contain shrink-0" />
                <input
                  value={form.social_links[p.key] ?? ''}
                  onChange={e => setSocialLink(p.key, e.target.value)}
                  placeholder={`Your ${p.name} handle/username…`}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={save} disabled={saving || !!uploading}
        className={`w-full flex items-center justify-center gap-2 font-black py-3 rounded-xl transition-all ${saved ? 'bg-green-600 text-white' : 'bg-green-500 hover:bg-green-400 text-black'} disabled:opacity-60`}>
        {saved ? <><Check size={16} /> Saved!</> : saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  )
}
