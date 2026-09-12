'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { sportLogoUrl } from '@/lib/sportLogos'
import Image from 'next/image'
import { SafeImage } from '@/components/ui/SafeImage'
import { AuthAlert, AuthBrand, AuthDivider, AuthExperience, AuthField, AuthHeading, AuthSubmit, ProviderButton, authExperienceStyles as auth } from '@/components/auth/AuthExperience'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'MMA', 'Soccer', 'Tennis', 'Golf']

const statVariants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.4 + i * 0.1, duration: 0.35 } }),
}

export default function RegisterPage() {
  const [step, setStep] = useState<'account' | 'profile'>('account')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [sports, setSports] = useState<string[]>(['MLB'])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)
  // null = still checking. This is the friendly UX layer for the common
  // case (someone using the real form) — the actual enforcement (blocking
  // signups even via a direct API call) lives in a database trigger, since
  // a client-side check alone can't stop that.
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null)
  const router = useRouter()

  // Same providers/handling as the login page — OAuth signup and sign-in are
  // the same Supabase call, so these buttons work for brand-new accounts too.
  function oauthHandler(provider: 'discord' | 'x') {
    return async () => {
      if (navigator.userAgent.includes('SlipSurgeDesktop/')) {
        const desktopState = crypto.randomUUID()
        localStorage.setItem('slipsurge_desktop_oauth_state', desktopState)
        router.push(`/auth/desktop/start?provider=${provider}&next=${encodeURIComponent('/onboarding')}&state=${encodeURIComponent(desktopState)}`)
        return
      }
      try {
        const supabase = createClient()
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${location.origin}/auth/callback?next=/onboarding` },
        })
        if (oauthError) setError('Could not start sign-up. Try again.')
      } catch {
        setError('Could not start sign-up. Try again.')
      }
    }
  }
  const handleDiscord = oauthHandler('discord')
  // Supabase's modern provider slot for X is 'x' (OAuth 2.0) — see login
  // page's comment on this same fix.
  const handleX = oauthHandler('x')
  function handleWhop() {
    if (navigator.userAgent.includes('SlipSurgeDesktop/')) {
      const desktopState = crypto.randomUUID()
      localStorage.setItem('slipsurge_desktop_oauth_state', desktopState)
      router.push(`/auth/desktop/start?provider=whop&next=${encodeURIComponent('/onboarding')}&state=${encodeURIComponent(desktopState)}`)
      return
    }
    router.push(`/auth/whop/login?next=${encodeURIComponent('/onboarding')}`)
  }

  useEffect(() => {
    let cancelled = false
    createClient().from('site_settings').select('value').eq('key', 'allow_registration').maybeSingle()
      .then(({ data }) => { if (!cancelled) setRegistrationOpen(data?.value !== 'false') })
    return () => { cancelled = true }
  }, [])

  function toggleSport(s: string) {
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (step === 'account') { setStep('profile'); return }
    if (username.length < 2 || username.length > 30 || !/^[a-z0-9._]+$/.test(username)) { setError('Use 2–30 letters, numbers, periods, or underscores for your username.'); return }
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
    // Without emailRedirectTo, Supabase falls back to the project's Site
    // URL for the confirmation link — worth double-checking that's set to
    // https://www.slipsurge.com (not a leftover localhost) in the Supabase
    // dashboard under Authentication > URL Configuration, since this can
    // only steer the redirect target, not fix a Site URL/allowed-redirects
    // misconfiguration on Supabase's side.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding`,
        // Also stashed in user metadata (readable with no session, unlike the
        // profile upsert below) so /auth/callback can pull the real chosen
        // values once confirmation completes, instead of falling back to a
        // generic email-derived username/display name.
        data: { username, display_name: displayName || username, sport_preferences: sports },
      },
    })
    if (signUpError) { setError('Could not create your account. Check your details and try again.'); return }
    if (data.user && data.session) {
      // The server derives all profile fields from the authenticated Auth
      // user and signup metadata. Browser sessions never receive INSERT
      // access to the users table.
      const response = await fetch('/api/account/bootstrap', { method: 'POST' })
      if (!response.ok) { setError('Your account was created, but setup could not finish. Sign in to continue.'); return }
    }
    if (data.session) {
      // Email confirmation is off (or already auto-confirmed) — real
      // session already exists, safe to go straight in.
      router.push('/onboarding')
    } else {
      // Confirmation required — no session yet, so navigating anywhere
      // gated would just bounce straight back to login. Tell them to check
      // their email instead of pretending signup finished.
      setConfirmationSent(true)
    }
    } catch {
      setError('Sign-up is unavailable. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthExperience panelWidth="compact" spotlight aside={
      <>
        <AuthBrand />
        <h2 className={auth.asideTitle}>Get in early.<br /><span>Build your record.</span></h2>
        <p className={auth.asideCopy}>Get in before the crowd. Share picks, build a following, and win together.</p>
        <div className={auth.stats}>
            {[['Real', 'Graded track records'], ['Live', 'Odds & line moves'], ['$0', 'Free to join']].map(([val, lbl], i) => (
              <motion.div key={lbl} custom={i} initial="hidden" animate="show" variants={statVariants} className={auth.stat}>
                <strong>{val}</strong>
                <span>{lbl}</span>
              </motion.div>
            ))}
        </div>
      </>
    }>

        {registrationOpen === false ? (
          <div className={auth.statusState}>
            <div className={auth.statusIcon}>🚧</div>
            <h1>Registration is closed</h1>
            <p>
              New accounts aren&apos;t open right now. Check back soon, or sign in if you already have one.
            </p>
            <Link href="/auth/login">Back to sign in</Link>
          </div>
        ) : confirmationSent ? (
          <div className={auth.statusState}>
            <div className={auth.statusIcon}>📬</div>
            <h1>Check your email</h1>
            <p>
              We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
            </p>
            <Link href="/auth/login">Back to sign in</Link>
          </div>
        ) : (
        <>
        {/* Progress */}
        <div
          className={auth.progress}
          role="progressbar"
          aria-label={`Registration step ${step === 'account' ? 1 : 2} of 2`}
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={step === 'account' ? 1 : 2}
        >
          {(['account', 'profile'] as const).map((s, i) => (
            <div key={s} className={i === 0 || step === 'profile' ? auth.progressActive : ''} />
          ))}
        </div>

        <AuthHeading title={step === 'account' ? 'Create account' : 'Set up your profile'} description={step === 'account' ? 'Join the sports social hub' : 'Choose how you appear across SlipSurge'} />

        {step === 'account' && (
          <>
            <ProviderButton provider="whop" onClick={handleWhop}>
              <Image src="https://whop.com/apple-icon.png" alt="" width={18} height={18} style={{ borderRadius: 4 }} />
              Continue with Whop
            </ProviderButton>
            <ProviderButton provider="discord" onClick={handleDiscord}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04c-1.7.29-3.36.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 8.7-.32 12.9.1 17.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13c.13-.09.25-.19.37-.28a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.19.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-4.83-.83-9-3.5-12.66a.06.06 0 0 0-.03-.03ZM8.02 14.5c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>
              Continue with Discord
            </ProviderButton>
            <ProviderButton provider="x" onClick={handleX}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M18.24 2H21.5l-7.3 8.34L22.8 22h-6.75l-5.28-6.9L4.7 22H1.44l7.8-8.92L1 2h6.92l4.78 6.32L18.24 2Zm-1.18 18h1.8L7.02 3.9H5.08l12 16.1Z"/></svg>
              Continue with X
            </ProviderButton>
            <AuthDivider />
          </>
        )}

        <form onSubmit={handleRegister} className={auth.form}>
          {step === 'account' ? (
            <>
              <AuthField label="Email">
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email" className="ss-input" />
              </AuthField>
              <AuthField label="Password">
                <input type="password" placeholder="Min 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="ss-input" />
              </AuthField>
            </>
          ) : (
            <>
              <AuthField label="Username">
                <input type="text" placeholder="capper_king" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} required minLength={2} maxLength={30} autoCapitalize="none" spellCheck={false} autoComplete="username" className="ss-input" />
              </AuthField>
              <AuthField label="Display name">
                <input type="text" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} maxLength={60} autoComplete="name" className="ss-input" />
              </AuthField>

              <div className={auth.sportFieldset}>
                <p>Sports you follow</p>
                <div>
                  {SPORTS.map(s => {
                    const logo = sportLogoUrl(s)
                    return (
                      <button key={s} type="button" aria-pressed={sports.includes(s)} onClick={() => toggleSport(s)}>
                        {logo && <SafeImage src={logo} alt="" className={auth.sportLogo} />}
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <p className={auth.contextNote}>
                Want to sell picks or build a paid community? Create your account first, then apply through the Creator program.
              </p>
            </>
          )}

          {error && <AuthAlert>{error}</AuthAlert>}

          <AuthSubmit disabled={loading}>{step === 'account' ? 'Continue →' : loading ? 'Creating account…' : 'Create account'}</AuthSubmit>
        </form>

        <p className={auth.switchPrompt}>
          Already have an account?{' '}
          <Link href="/auth/login">Sign in</Link>
        </p>
        </>
        )}
    </AuthExperience>
  )
}
