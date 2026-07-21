'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia } from '@/lib/uploadMedia'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronRight, Loader2, Upload } from 'lucide-react'
import { MLB_TEAMS } from '@/lib/mlbTeams'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { SuggestedUsers, type SuggestedUser } from '@/components/social/SuggestedUsers'

// dynamic(..., { ssr: false }) isn't allowed inside the server-rendered
// onboarding page itself (Next 16), so the Meteors background lives here
// instead — this component is already 'use client'.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

const STEPS = ['Welcome', 'Profile', 'Photo', 'Teams', 'Privacy', 'Follow', 'Done']

const slide = {
  enter: { opacity: 0, x: 16 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
}

export function OnboardingFlow({ userId, initialProfile, accountType, suggestedUsers }: {
  userId: string
  initialProfile: any
  accountType: 'user' | 'creator'
  suggestedUsers: SuggestedUser[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState(0)
  const [displayName, setDisplayName] = useState(initialProfile?.display_name ?? '')
  const [bio, setBio] = useState(initialProfile?.bio ?? '')
  const [avatarUrl, setAvatarUrl] = useState(initialProfile?.avatar_url ?? '')
  const [teams, setTeams] = useState<string[]>(initialProfile?.favorite_teams ?? [])
  // Same two toggles/copy as Settings > Privacy (PrivacySettingsForm) — new
  // members had no way to know these existed at all before this step, since
  // nothing pointed them at Settings unless they went looking on their own.
  const [isPrivate, setIsPrivate] = useState(initialProfile?.is_private ?? false)
  const [hideWinRate, setHideWinRate] = useState(initialProfile?.hide_win_rate ?? false)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const avatarInputRef = useRef<HTMLInputElement>(null)

  function toggleTeam(abbr: string) {
    setTeams(prev => prev.includes(abbr) ? prev.filter(x => x !== abbr) : [...prev, abbr])
  }

  async function uploadAvatar(file: File) {
    setError(''); setUploading(true)
    try {
      const result = await uploadMedia(file, 'avatars')
      if ('error' in result) { setError(result.error); return }
      setAvatarUrl(result.publicUrl)
    } catch (e: any) {
      setError(e?.message || 'Upload failed — please try again.')
    } finally {
      setUploading(false)
    }
  }

  async function finish() {
    setSaving(true)
    await supabase.from('users').update({
      display_name: displayName.trim() || undefined,
      bio: bio.trim() || undefined,
      avatar_url: avatarUrl.trim() || undefined,
      favorite_teams: teams,
      is_private: isPrivate,
      hide_win_rate: hideWinRate,
      // The proxy (src/lib/supabase/middleware.ts) redirects any
      // authenticated request back to /onboarding until this is set —
      // this is the one place that ever sets it.
      onboarding_completed_at: new Date().toISOString(),
    }).eq('id', userId)
    // Best-effort — never blocks getting into the app if the email fails.
    fetch('/api/onboarding/notify-welcome', { method: 'POST' }).catch(() => {})
    router.push('/feed')
  }

  const initials = (displayName || initialProfile?.username || '?')[0]?.toUpperCase()

  return (
    <>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <Meteors number={12} className="opacity-60" />
      </div>
      <div className="w-full max-w-md" style={{ position: 'relative', zIndex: 1 }}>
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : undefined }}>
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
              style={{
                background: i < step ? 'var(--accent)' : i === step ? 'var(--surface-3)' : 'var(--surface-2)',
                color: i < step ? 'var(--accent-fg)' : i === step ? 'var(--text-1)' : 'var(--text-3)',
                boxShadow: i === step ? '0 0 0 2px var(--accent)' : 'none',
              }}
            >
              {i < step ? <Check size={12} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-0.5 mx-1" style={{ background: i < step ? 'var(--accent)' : 'var(--border)' }} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.2)', fontSize: 13, color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={step} variants={slide} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>

          {step === 0 && (
            <div className="text-center space-y-6">
              <div>
                <p className="text-5xl mb-4">⚡</p>
                <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                  Welcome to <span style={{ color: 'var(--accent)' }}>SlipSurge</span>
                </h1>
                <p style={{ color: 'var(--text-2)', marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
                  {accountType === 'creator'
                    ? "You're set up as a Capper. Build your record in the open, share picks, and grow a following."
                    : 'The social hub for sports & picks. Follow real graded records, share your own, and never miss a line move.'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { emoji: '🏆', label: 'Follow top cappers' },
                  { emoji: '🎯', label: 'Share your picks' },
                  { emoji: '💰', label: 'Track your wins' },
                ].map(f => (
                  <div key={f.label} className="ss-card" style={{ padding: 12, textAlign: 'center' }}>
                    <p style={{ fontSize: 22, marginBottom: 4 }}>{f.emoji}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{f.label}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => setStep(1)} className="ss-btn ss-btn-accent w-full justify-center" style={{ padding: '13px 20px', fontSize: 14 }}>
                Get Started <ChevronRight size={16} />
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>Your Profile</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>How should others know you?</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Display Name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name or handle" className="ss-input" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>Bio</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell people who you are — your record, strategy, teams you follow…" rows={3} className="ss-input" style={{ resize: 'none' }} />
                </div>
              </div>
              <StepNav onBack={() => setStep(0)} onNext={() => setStep(2)} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>Add a Photo</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Profiles with a real picture get way more follows.</p>
              </div>
              <div className="flex flex-col items-center gap-4 py-4">
                <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = '' }} />
                <button
                  type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading}
                  className="relative rounded-full overflow-hidden flex items-center justify-center group"
                  style={{ width: 112, height: 112, background: 'var(--surface-2)', border: '2px solid var(--border-2)', fontSize: 36, fontWeight: 900, color: 'var(--text-3)' }}
                >
                  {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.55)' }}>
                    {uploading ? <Loader2 size={22} className="animate-spin" color="#fff" /> : <Upload size={22} color="#fff" />}
                  </div>
                </button>
                <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploading} style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                  {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Upload a photo'}
                </button>
              </div>
              <StepNav onBack={() => setStep(1)} onNext={() => setStep(3)} nextLabel={avatarUrl ? 'Next' : 'Skip for now'} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>Favorite Teams</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>We'll personalize your feed and Dugout around these.</p>
              </div>
              <div className="flex flex-wrap gap-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {MLB_TEAMS.map(t => (
                  <button key={t.abbr} type="button" onClick={() => toggleTeam(t.abbr)}
                    className="flex items-center gap-1.5"
                    style={{
                      padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${teams.includes(t.abbr) ? 'var(--accent)' : 'var(--border-2)'}`,
                      background: teams.includes(t.abbr) ? 'var(--accent-dim)' : 'transparent',
                      color: teams.includes(t.abbr) ? 'var(--accent)' : 'var(--text-3)',
                      transition: 'all 130ms',
                    }}>
                    <img src={getTeamLogoUrl(t.abbr)} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                    {t.shortName}
                  </button>
                ))}
              </div>
              <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel={teams.length ? 'Next' : 'Skip for now'} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>Your Privacy</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>You're in control of what others can see. Change these anytime in Settings.</p>
              </div>
              <div className="ss-card" style={{ padding: 0 }}>
                {[
                  { label: 'Private Account', desc: 'Only your followers can see your posts, picks, and pick record — you\'re also removed from the public leaderboard. Your profile, username, and bio stay visible', value: isPrivate, set: setIsPrivate },
                  { label: 'Hide Win Rate', desc: 'Hide your pick record and win rate from your public profile', value: hideWinRate, set: setHideWinRate },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: s.label === 'Private Account' ? '1px solid var(--border)' : 'none' }}>
                    <div style={{ paddingRight: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{s.label}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4 }}>{s.desc}</p>
                    </div>
                    <button type="button" onClick={() => s.set(!s.value)}
                      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${s.value ? 'bg-green-500' : 'bg-zinc-700'}`}>
                      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${s.value ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                ))}
              </div>
              <StepNav onBack={() => setStep(3)} onNext={() => setStep(5)} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>Who to Follow</h2>
                <p style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 4 }}>Follow a few to get your feed going — you can always find more later.</p>
              </div>
              {suggestedUsers.length > 0 ? (
                <div className="ss-card" style={{ padding: 16 }}>
                  <SuggestedUsers users={suggestedUsers} currentUserId={userId} />
                </div>
              ) : (
                <div className="ss-card" style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                  No suggestions yet — you'll find people to follow all over the app.
                </div>
              )}
              <StepNav onBack={() => setStep(4)} onNext={() => setStep(6)} />
            </div>
          )}

          {step === 6 && (
            <div className="text-center space-y-6">
              <div>
                <p className="text-5xl mb-4">🎉</p>
                <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-1)' }}>You're all set!</h2>
                <p style={{ color: 'var(--text-2)', marginTop: 8, fontSize: 14 }}>
                  {accountType === 'creator'
                    ? 'Your profile is ready — drop your first pick and start building your record.'
                    : "Your feed is ready. Let's see what's happening."}
                </p>
              </div>
              <button onClick={finish} disabled={saving} className="ss-btn ss-btn-accent w-full justify-center" style={{ padding: '13px 20px', fontSize: 14, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : 'Go to My Feed →'}
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
    <div className="flex gap-3">
      <button onClick={onBack} className="ss-btn ss-btn-ghost flex-1 justify-center" style={{ padding: '12px 20px', fontSize: 14 }}>Back</button>
      <button onClick={onNext} className="ss-btn ss-btn-accent flex-1 justify-center" style={{ padding: '12px 20px', fontSize: 14 }}>
        {nextLabel} <ChevronRight size={16} />
      </button>
    </div>
  )
}
