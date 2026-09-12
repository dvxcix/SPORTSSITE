'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { Check, Loader2 } from 'lucide-react'
import { MLB_TEAMS } from '@slipsurge/core/mlbTeams'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { createClient } from '@/lib/supabase/client'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'

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

export function InterestSettingsForm({ userId, favoriteSports, favoriteTeams, settings, nflTeams }: {
  userId: string
  favoriteSports: string[]
  favoriteTeams: string[]
  settings: InterestSettings
  nflTeams: Array<{ team_abbr: string; team_name: string; team_logo_espn: string | null }>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [sports, setSports] = useState(favoriteSports)
  const [teams, setTeams] = useState(favoriteTeams)
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
      favorite_teams: teams,
      interest_settings: { content_mix: contentMix, market_focus: marketFocus, discovery_mode: discoveryMode },
    }).eq('id', userId)
    setSaving(false)
    if (saveError) { setError('Could not save your interests. Try again.'); return }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2200)
  }

  return <div className="ss-interest-settings">
    <PreferenceSection title="Sports" description="Choose the leagues that shape your home and discovery views.">
      <ChoiceGrid>{SPORTS.map(sport => <Choice key={sport} selected={sports.includes(sport)} onClick={() => toggle(sport, sports, setSports)}>{sport}</Choice>)}</ChoiceGrid>
    </PreferenceSection>

    {(sports.length === 0 || sports.includes('MLB')) && <PreferenceSection title="MLB teams" description="Favorite teams stay close across scores, research, and community.">
      <ChoiceGrid>{MLB_TEAMS.map(team => <Choice key={team.abbr} selected={teams.includes(team.abbr)} onClick={() => toggle(team.abbr, teams, setTeams)}><Image src={getTeamLogoUrl(team.abbr) ?? '/logo.png'} alt="" width={20} height={20}/>{team.shortName}</Choice>)}</ChoiceGrid>
    </PreferenceSection>}

    {sports.includes('NFL') && nflTeams.length > 0 && <PreferenceSection title="NFL teams" description="Your teams surface first during the week and on game day.">
      <ChoiceGrid>{nflTeams.map(team => <Choice key={team.team_abbr} selected={teams.includes(team.team_abbr)} onClick={() => toggle(team.team_abbr, teams, setTeams)}><NflTeamLogo abbr={team.team_abbr} logoUrl={team.team_logo_espn} size={20}/>{team.team_name}</Choice>)}</ChoiceGrid>
    </PreferenceSection>}

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
