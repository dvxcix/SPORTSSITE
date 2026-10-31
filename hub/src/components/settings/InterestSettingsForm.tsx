'use client'

import { useMemo, useState } from 'react'
import { FavoritePicker } from '@/components/profile/FavoritePicker'
import { normalizeFavoritePlayers, type FavoritePlayer } from '@/lib/sportFavorites'
import { Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { MLB_HIBERNATING } from '@/lib/mlbOffseason'

type InterestSettings = {
  content_mix?: string[]
  market_focus?: string[]
  discovery_mode?: 'balanced' | 'following' | 'live'
}

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']
const CONTENT = [
  ['research', 'Research'], ['picks', 'Picks'], ['live-games', 'Live games'],
  ['community', 'Community'], ['creators', 'Creators'], ['results', 'Results'],
] as const
const MARKETS = [
  ['moneyline', 'Game lines'], ['player-props', 'Player props'], ['milestones', 'Ladders'],
  ['first-score', 'First score'], ['live', 'Live markets'], ['matrices', 'Matrices'],
] as const
const MODES = [
  ['balanced', 'Balanced', 'A mix of people you follow and relevant discovery.'],
  ['following', 'Following first', 'Prioritize people and communities you chose.'],
  ['live', 'Live first', 'Prioritize active games, movement, and breaking updates.'],
] as const

export function InterestSettingsForm({ userId, favoriteSports, favoriteTeams, favoritePlayers, settings, allowNba = true }: {
  userId: string
  favoriteSports: string[]
  favoriteTeams: string[]
  settings: InterestSettings
  favoritePlayers: FavoritePlayer[]
  allowNba?: boolean
}) {
  const { profile } = useAuth()
  const supabase = useMemo(() => createClient(), [])
  const [sports, setSports] = useState(favoriteSports)
  const [teams, setTeams] = useState(favoriteTeams)
  const [players, setPlayers] = useState(() => normalizeFavoritePlayers(favoritePlayers))
  const [contentMix, setContentMix] = useState(settings.content_mix ?? ['research', 'picks', 'live-games'])
  const [marketFocus, setMarketFocus] = useState(settings.market_focus ?? ['player-props', 'milestones'])
  const [discoveryMode, setDiscoveryMode] = useState<InterestSettings['discovery_mode']>(settings.discovery_mode ?? 'balanced')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const toggle = (value: string, current: string[], set: (next: string[]) => void) =>
    set(current.includes(value) ? current.filter(item => item !== value) : [...current, value])

  async function save() {
    setSaving(true); setSaved(false); setError('')
    const { error: saveError } = await supabase.from('users').update({
      favorite_sports: sports,
      interest_settings: { content_mix: contentMix, market_focus: marketFocus, discovery_mode: discoveryMode },
    }).eq('id', userId)
    if (saveError) { setSaving(false); setError('Could not save your interests. Try again.'); return }
    const favoritesResponse = await fetch('/api/account/favorites', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teams, players }) }).catch(() => null)
    setSaving(false)
    if (!favoritesResponse?.ok) { setError('Your interests were saved, but favorites could not be saved. Please try again.'); return }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return <div className="ss-interest-settings">
    <PreferenceSection title="Sports" description="Choose the leagues that shape your home and discovery views.">
      <ChoiceGrid>{SPORTS.filter(sport => (allowNba || sport !== 'NBA') && (!MLB_HIBERNATING || profile?.account_type === 'admin' || sport !== 'MLB')).map(sport => <Choice key={sport} selected={sports.includes(sport)} onClick={() => toggle(sport, sports, setSports)}>{sport}</Choice>)}</ChoiceGrid>
    </PreferenceSection>

    <PreferenceSection title="Teams & players" description="Keep your favorites close."><FavoritePicker teams={teams} players={players} sports={sports} allowNba={allowNba} onTeamsChange={setTeams} onPlayersChange={setPlayers}/></PreferenceSection>

    <PreferenceSection title="Home mix" description="Set the kinds of activity that deserve the most space.">
      <ChoiceGrid>{CONTENT.map(([value, label]) => <Choice key={value} selected={contentMix.includes(value)} onClick={() => toggle(value, contentMix, setContentMix)}>{label}</Choice>)}</ChoiceGrid>
    </PreferenceSection>

    <PreferenceSection title="Market focus" description="Choose the research lanes you return to most.">
      <ChoiceGrid>{MARKETS.map(([value, label]) => <Choice key={value} selected={marketFocus.includes(value)} onClick={() => toggle(value, marketFocus, setMarketFocus)}>{label}</Choice>)}</ChoiceGrid>
    </PreferenceSection>

    <PreferenceSection title="Discovery" description="Control what leads when your home feed has room to explore.">
      <div className="ss-interest-modes">{MODES.map(([value, label, copy]) => <button key={value} type="button" aria-pressed={discoveryMode === value} className={discoveryMode === value ? 'is-selected' : ''} onClick={() => setDiscoveryMode(value)}><span>{discoveryMode === value && <Check size={14}/>}</span><strong>{label}</strong><small>{copy}</small></button>)}</div>
    </PreferenceSection>

    {error && <p role="alert" className="ss-settings-feedback">{error}</p>}
    <button type="button" className="ss-settings-primary" disabled={saving} onClick={save}>{saving ? <><Loader2 size={14} className="animate-spin"/> Saving…</> : saved ? <><Check size={14}/> Saved</> : 'Save interests'}</button>
  </div>
}

function PreferenceSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="ss-interest-section"><header><h2>{title}</h2><p>{description}</p></header>{children}</section>
}

function ChoiceGrid({ children }: { children: React.ReactNode }) { return <div className="ss-interest-grid">{children}</div> }

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} className={selected ? 'is-selected' : ''} onClick={onClick}>{selected && <Check size={12}/>} {children}</button>
}
