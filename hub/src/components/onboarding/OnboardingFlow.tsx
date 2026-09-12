'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight, Loader2, Upload } from 'lucide-react'
import { MLB_TEAMS } from '@slipsurge/core/mlbTeams'
import { getTeamLogoUrl } from '@slipsurge/core/mlbTeamColors'
import { SuggestedUsers, type SuggestedUser } from '@/components/social/SuggestedUsers'
import { trackProductEvent } from '@/lib/productAnalytics'
import { Switch } from '@/components/ui/Switch'
import { NflTeamLogo } from '@/components/shared/NflTeamLogo'

// dynamic(..., { ssr: false }) isn't allowed inside the server-rendered
// onboarding page itself (Next 16), so the Meteors background lives here
// instead — this component is already 'use client'.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

const STEPS = ['Welcome', 'Profile', 'Photo', 'Teams', 'Privacy', 'Alerts', 'Follow', 'Done']
const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA']
const CONTENT_INTERESTS = [
  ['research', 'Research'], ['picks', 'Picks'], ['live-games', 'Live games'],
  ['community', 'Community'], ['creators', 'Creators'], ['results', 'Results'],
] as const
const MARKET_INTERESTS = [
  ['moneyline', 'Game lines'], ['player-props', 'Player props'], ['milestones', 'Ladders'],
  ['first-score', 'First score'], ['live', 'Live markets'], ['matrices', 'Matrices'],
] as const

const slide = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
}

export function OnboardingFlow({ userId, initialProfile, accountType, suggestedUsers, nflTeams }: {
  userId: string
  initialProfile: any
  accountType: 'user' | 'creator'
  suggestedUsers: SuggestedUser[]
  nflTeams: Array<{ team_abbr: string; team_name: string; team_logo_espn: string | null }>
}) {
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url ?? '')
  const [teams, setTeams] = useState<string[]>(initialProfile?.favorite_teams ?? [])
  const [sports, setSports] = useState<string[]>(initialProfile?.favorite_sports ?? [])
  const [contentMix, setContentMix] = useState<string[]>(initialProfile?.interest_settings?.content_mix ?? ['research', 'picks', 'live-games'])
  const [marketFocus, setMarketFocus] = useState<string[]>(initialProfile?.interest_settings?.market_focus ?? ['player-props', 'milestones'])
  // Same two toggles/copy as Settings > Privacy (PrivacySettingsForm) — new
  // members had no way to know these existed at all before this step, since
  // nothing pointed them at Settings unless they went looking on their own.
  const [isPrivate, setIsPrivate] = useState(initialProfile?.is_private ?? false)
  const [hideWinRate, setHideWinRate] = useState(initialProfile?.hide_win_rate ?? false)
  const [alerts, setAlerts] = useState<Record<string, boolean>>({
    lineup_confirmed: initialProfile?.notification_settings?.lineup_confirmed ?? true,
    new_pick: initialProfile?.notification_settings?.new_pick ?? true,
    pick_result: initialProfile?.notification_settings?.pick_result ?? true,
    dm: initialProfile?.notification_settings?.dm ?? true,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const draftReady = useRef(false)
  const draftKey = `slipsurge:onboarding:${userId}`

  useEffect(() => {
    let active = true
    try {
      const saved = localStorage.getItem(draftKey)
      if (saved) {
        const draft = JSON.parse(saved) as { step?: number; displayName?: string; bio?: string; avatarUrl?: string; teams?: string[]; sports?: string[]; contentMix?: string[]; marketFocus?: string[]; isPrivate?: boolean; hideWinRate?: boolean; alerts?: Record<string, boolean> }
        queueMicrotask(() => {
          if (!active) return
          if (Number.isInteger(draft.step)) setStep(Math.max(0, Math.min(STEPS.length - 1, draft.step!)))
          if (typeof draft.displayName === 'string') setDisplayName(draft.displayName)
          if (typeof draft.bio === 'string') setBio(draft.bio)
          if (typeof draft.avatarUrl === 'string') setAvatarUrl(draft.avatarUrl)
          if (Array.isArray(draft.teams)) setTeams(draft.teams.filter(value => typeof value === 'string'))
          if (Array.isArray(draft.sports)) setSports(draft.sports.filter(value => typeof value === 'string'))
          if (Array.isArray(draft.contentMix)) setContentMix(draft.contentMix.filter(value => typeof value === 'string'))
          if (Array.isArray(draft.marketFocus)) setMarketFocus(draft.marketFocus.filter(value => typeof value === 'string'))
          if (typeof draft.isPrivate === 'boolean') setIsPrivate(draft.isPrivate)
          if (typeof draft.hideWinRate === 'boolean') setHideWinRate(draft.hideWinRate)
          if (draft.alerts && typeof draft.alerts === 'object') setAlerts(current => ({ ...current, ...draft.alerts }))
          draftReady.current = true
        })
        return () => { active = false }
      }
    } catch { localStorage.removeItem(draftKey) }
    draftReady.current = true
    return () => { active = false }
  }, [draftKey])

  useEffect(() => {
    if (!draftReady.current) return
    try { localStorage.setItem(draftKey, JSON.stringify({ step, displayName, bio, avatarUrl, teams, sports, contentMix, marketFocus, isPrivate, hideWinRate, alerts })) } catch { /* storage may be unavailable */ }
  }, [alerts, avatarUrl, bio, contentMix, displayName, draftKey, hideWinRate, isPrivate, marketFocus, sports, step, teams])

  function toggleTeam(abbr: string) {
    setTeams(prev => prev.includes(abbr) ? prev.filter(x => x !== abbr) : [...prev, abbr])
  }

  function toggleSport(sport: string) {
    setSports(prev => prev.includes(sport) ? prev.filter(value => value !== sport) : [...prev, sport])
  }

  function toggleInterest(value: string, current: string[], setCurrent: (next: string[]) => void) {
    setCurrent(current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  async function uploadAvatar(file: File) {
    setError(''); setUploading(true)
    try {
      const result = await uploadMedia(file, 'avatars')
      if ('error' in result) { setError(result.error); return }
      setAvatarUrl(result.publicUrl)
    } catch {
      setError('Upload failed. Try again.')
    } finally {
      setUploading(false)
    }
  }

  async function finish() {
    setError('')
    setSaving(true)
    try {
      const { error: updateError } = await supabase.from('users').update({
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar_url: avatarUrl.trim() || undefined,
        favorite_teams: teams,
        favorite_sports: sports,
        interest_settings: {
          content_mix: contentMix,
          market_focus: marketFocus,
          discovery_mode: initialProfile?.interest_settings?.discovery_mode ?? 'balanced',
        },
        is_private: isPrivate,
        hide_win_rate: hideWinRate,
        notification_settings: { ...(initialProfile?.notification_settings ?? {}), ...alerts },
        onboarding_completed_at: new Date().toISOString(),
      }).eq('id', userId).select('id').single()
      if (updateError) throw updateError
      localStorage.removeItem(draftKey)
      fetch('/api/onboarding/notify-welcome', { method: 'POST', keepalive: true }).catch(() => {})
      trackProductEvent('onboarding_completed', { account_type: accountType, favorite_team_count: teams.length, favorite_sport_count: sports.length })
      window.location.replace('/feed')
    } catch {
      setSaving(false)
      setError('We could not save your profile. Check your connection and try again.')
    }
  }

  const initials = (displayName || initialProfile?.username || '?')[0]?.toUpperCase()

  return (
    <>
      <div className="ss-onboarding-meteors" aria-hidden="true">
        <Meteors number={12} className="opacity-60" />
      </div>
      <div className="ss-onboarding-card">
      {/* Progress */}
      <div className="ss-onboarding-progress">
        <div className="ss-onboarding-progress-copy">
          <span>ACCOUNT SETUP</span>
          <strong>{STEPS[step]}</strong>
          <small>Step {step + 1} of {STEPS.length}</small>
        </div>
        <div className="ss-onboarding-progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={`Onboarding: ${STEPS[step]}`}>
        {STEPS.map((s, i) => (
          <div key={s} className="ss-onboarding-progress-step" data-state={i < step ? 'complete' : i === step ? 'current' : 'upcoming'}>
            <div
              className="ss-onboarding-progress-dot"
            >
              {i < step ? <Check size={12} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className="ss-onboarding-progress-line" />
            )}
          </div>
        ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="ss-onboarding-alert">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div className="ss-onboarding-stage" key={step} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22 }}>

          {step === 0 && (
            <div className="ss-onboarding-screen is-centered">
              <div>
                <p className="ss-onboarding-emoji">⚡</p>
                <h1>
                  Welcome to <span>SlipSurge</span>
                </h1>
                <p className="ss-onboarding-lead">
                  {accountType === 'creator'
                    ? "You're set up as a Capper. Build your record in the open, share picks, and grow a following."
                    : 'The social hub for sports & picks. Follow real graded records, share your own, and never miss a line move.'}
                </p>
              </div>
              <div className="ss-onboarding-benefits">
                {[
                  { emoji: '🏆', label: 'Follow top cappers' },
                  { emoji: '🎯', label: 'Share your picks' },
                  { emoji: '💰', label: 'Track your wins' },
                ].map(f => (
                  <div key={f.label} className="ss-onboarding-benefit">
                    <p>{f.emoji}</p>
                    <span>{f.label}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="ss-onboarding-primary">
                Get Started <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Your Profile" copy="How should others know you?" />
              <div className="ss-onboarding-fields">
                <label>
                  <span>Display Name</span>
                  <input value={displayName} maxLength={60} autoComplete="name" onChange={e => setDisplayName(e.target.value)} placeholder="Your name or handle" className="ss-input" />
                </label>
                <label>
                  <span>Bio</span>
                  <textarea value={bio} maxLength={280} onChange={e => setBio(e.target.value)} placeholder="Tell people who you are — your record, strategy, teams you follow…" rows={3} className="ss-input" />
                </label>
              </div>
              <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
            </div>
          )}

          {step === 2 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Add a Photo" copy="Help people recognize you across the feed, messages, and communities." />
              <div className="ss-onboarding-photo">
                <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = '' }} />
                <button
                  type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading}
                  className="ss-onboarding-avatar group"
                >
                  {avatarUrl ? <Image src={avatarUrl} alt="" fill sizes="112px" className="object-cover" /> : initials}
                  <div className="ss-onboarding-avatar-overlay">
                    {uploading ? <Loader2 size={22} className="animate-spin" color="#fff" /> : <Upload size={22} color="#fff" />}
                  </div>
                </button>
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading} className="ss-onboarding-upload">
                  {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload a photo'}
                </button>
              </div>
              <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel={avatarUrl ? 'Next' : 'Skip for now'} />
            </div>
          )}

          {step === 3 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Your Sports" copy="Choose what you follow. You can refine this anytime." />
              <div className="ss-onboarding-sports">
                {SPORTS.map(sport => <button key={sport} type="button" aria-pressed={sports.includes(sport)} className={sports.includes(sport) ? 'is-selected' : ''} onClick={() => toggleSport(sport)}>{sports.includes(sport) && <Check size={12}/>} {sport}</button>)}
              </div>
              {(sports.length === 0 || sports.includes('MLB')) && <div>
                <p className="ss-onboarding-kicker">Favorite MLB teams</p>
                <div className="ss-onboarding-teams">
                  {MLB_TEAMS.map(t => (
                    <button key={t.abbr} type="button" aria-pressed={teams.includes(t.abbr)} onClick={() => toggleTeam(t.abbr)} className={teams.includes(t.abbr) ? 'is-selected' : ''}>
                      <Image src={getTeamLogoUrl(t.abbr) ?? '/logo.png'} alt="" width={18} height={18} />
                      {t.shortName}
                    </button>
                  ))}
                </div>
              </div>}
              {sports.includes('NFL') && nflTeams.length > 0 && <div>
                <p className="ss-onboarding-kicker">Favorite NFL teams</p>
                <div className="ss-onboarding-teams">
                  {nflTeams.map(team => (
                    <button key={team.team_abbr} type="button" aria-pressed={teams.includes(team.team_abbr)} onClick={() => toggleTeam(team.team_abbr)} className={teams.includes(team.team_abbr) ? 'is-selected' : ''}>
                      <NflTeamLogo abbr={team.team_abbr} logoUrl={team.team_logo_espn} size={18}/>
                      {team.team_name}
                    </button>
                  ))}
                </div>
              </div>}
              <div>
                <p className="ss-onboarding-kicker">What should lead your home?</p>
                <div className="ss-onboarding-sports">
                  {CONTENT_INTERESTS.map(([value, label]) => <button key={value} type="button" aria-pressed={contentMix.includes(value)} className={contentMix.includes(value) ? 'is-selected' : ''} onClick={() => toggleInterest(value, contentMix, setContentMix)}>{contentMix.includes(value) && <Check size={12}/>} {label}</button>)}
                </div>
              </div>
              <div>
                <p className="ss-onboarding-kicker">Markets you follow</p>
                <div className="ss-onboarding-sports">
                  {MARKET_INTERESTS.map(([value, label]) => <button key={value} type="button" aria-pressed={marketFocus.includes(value)} className={marketFocus.includes(value) ? 'is-selected' : ''} onClick={() => toggleInterest(value, marketFocus, setMarketFocus)}>{marketFocus.includes(value) && <Check size={12}/>} {label}</button>)}
                </div>
              </div>
              <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel={sports.length || teams.length ? 'Next' : 'Skip for now'} />
            </div>
          )}

          {step === 4 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Your Privacy" copy="You’re in control of what others can see. Change these anytime in Settings." />
              <div className="ss-onboarding-preferences">
                {[
                  { label: 'Private Account', desc: 'Only your followers can see your posts, picks, and pick record — you\'re also removed from the public leaderboard. Your profile, username, and bio stay visible', value: isPrivate, set: setIsPrivate },
                  { label: 'Hide Win Rate', desc: 'Hide your pick record and win rate from your public profile', value: hideWinRate, set: setHideWinRate },
                ].map(s => (
                  <div key={s.label}>
                    <div>
                      <strong>{s.label}</strong>
                      <p>{s.desc}</p>
                    </div>
                    <Switch checked={s.value} onChange={s.set} ariaLabel={s.label} />
                  </div>
                ))}
              </div>
              <StepNav onBack={() => setStep(3)} onNext={() => setStep(5)} />
            </div>
          )}

          {step === 5 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Choose Your Alerts" copy="Keep the signals you care about. You can fine-tune delivery in Settings." />
              <div className="ss-onboarding-preferences">
                {[
                  { key: 'lineup_confirmed', label: 'Lineup changes', desc: 'Confirmed and changed MLB lineups' },
                  { key: 'new_pick', label: 'Following activity', desc: 'New picks from people you follow' },
                  { key: 'pick_result', label: 'Pick results', desc: 'When a tracked pick is graded' },
                  { key: 'dm', label: 'Direct messages', desc: 'New private messages' },
                ].map(item => <div key={item.key}><div><strong>{item.label}</strong><p>{item.desc}</p></div><Switch checked={alerts[item.key]} onChange={checked => setAlerts(current => ({ ...current, [item.key]: checked }))} ariaLabel={item.label}/></div>)}
              </div>
              <StepNav onBack={() => setStep(4)} onNext={() => setStep(6)} />
            </div>
          )}

          {step === 6 && (
            <div className="ss-onboarding-screen">
              <StepHeading title="Who to Follow" copy="Follow a few to get your feed going — you can always find more later." />
              {suggestedUsers.length > 0 ? (
                <div className="ss-onboarding-suggestions">
                  <SuggestedUsers users={suggestedUsers} currentUserId={userId} />
                </div>
              ) : (
                <div className="ss-onboarding-empty">
                  No suggestions yet — you'll find people to follow all over the app.
                </div>
              )}
              <StepNav onBack={() => setStep(5)} onNext={() => setStep(7)} />
            </div>
          )}

          {step === 7 && (
            <div className="ss-onboarding-screen is-centered">
              <div>
                <p className="ss-onboarding-emoji">🎉</p>
                <h2>You&apos;re all set!</h2>
                <p className="ss-onboarding-lead">
                  {accountType === 'creator'
                    ? 'Your profile is ready — drop your first pick and start building your record.'
                    : "Your feed is ready. Let's see what's happening."}
                </p>
              </div>
              <button type="button" onClick={finish} disabled={saving} className="ss-onboarding-primary">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Go to My Feed →'}
              </button>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
      </div>
    </>
  )
}

function StepNav({ onBack, onNext, nextLabel = 'Next' }: { onBack: () => void; onNext: () => void; nextLabel?: string }) {
  return (
    <div className="ss-onboarding-nav">
      <button type="button" onClick={onBack}>Back</button>
      <button type="button" onClick={onNext}>
        {nextLabel} <ChevronRight size={16} />
      </button>
    </div>
  )
}

function StepHeading({ title, copy }: { title: string; copy: string }) {
  return <header className="ss-onboarding-heading"><h2>{title}</h2><p>{copy}</p></header>
}
