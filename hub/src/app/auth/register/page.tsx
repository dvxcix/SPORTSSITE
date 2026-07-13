'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { Spotlight } from '@/components/ui/spotlight'
import { sportLogoUrl } from '@/lib/sportLogos'

// Client-only — Meteors' random delays/durations differ between server and
// client render, which React flags as a hydration mismatch otherwise.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

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
  const [accountType, setAccountType] = useState<'user' | 'creator'>('user')
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
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${location.origin}/auth/callback?next=/onboarding` },
      })
    }
  }
  const handleDiscord = oauthHandler('discord')
  // Supabase's modern provider slot for X is 'x' (OAuth 2.0) — see login
  // page's comment on this same fix.
  const handleX = oauthHandler('x')
  function handleWhop() {
    location.href = `/auth/whop/login?next=${encodeURIComponent('/onboarding')}`
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
    setLoading(true)
    setError('')
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
        data: { username, display_name: displayName || username, sport_preferences: sports, account_type: accountType },
      },
    })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    if (data.user) {
      // Only succeeds here when email confirmation is off and signUp()
      // already returned a live session (auth.uid() satisfies the users
      // table's RLS insert check). When confirmation is required, there's no
      // session yet, this silently fails RLS, and /auth/callback's metadata
      // fallback (above) is what actually creates the profile.
      await supabase.from('users').upsert({
        id: data.user.id, email, username,
        display_name: displayName || username,
        sport_preferences: sports, account_type: accountType,
      })
    }
    setLoading(false)
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
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: 'var(--bg)' }}>
      {/* Left panel */}
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'center',
        padding: '60px', background: 'var(--surface)', borderRight: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
      }} className="lg:flex">
        <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,255,77,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Meteors number={14} className="opacity-70" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <img src="/logo.png" alt="SlipSurge" style={{ width: 44, height: 44, objectFit: 'contain' }} />
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Slip<span style={{ color: 'var(--accent)' }}>Surge</span></div>
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 16 }}>
            Join 10,000+<br />sports bettors.
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 360 }}>
            Get in before the crowd. Share picks, build a following, and win together.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 48 }}>
            {[['10K+', 'Members'], ['85%', 'Win rate tracking'], ['$0', 'Free to join']].map(([val, lbl], i) => (
              <motion.div key={lbl} custom={i} initial="hidden" animate="show" variants={statVariants}>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.03em' }}>{val}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{lbl}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '40px 48px' }} className="lg:w-[460px]">
        {/* Mobile logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }} className="lg:hidden">
          <img src="/logo.png" alt="SlipSurge" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>Slip<span style={{ color: 'var(--accent)' }}>Surge</span></span>
        </div>

        {registrationOpen === false ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>Registration is closed</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
              New accounts aren't open right now. Check back soon, or sign in if you already have one.
            </p>
            <Link href="/auth/login" style={{
              display: 'inline-block', marginTop: 24,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              fontWeight: 800, padding: '10px 24px', borderRadius: 99, fontSize: 13, textDecoration: 'none',
            }}>
              Back to sign in
            </Link>
          </div>
        ) : confirmationSent ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>Check your email</h1>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 340, margin: '0 auto' }}>
              We sent a confirmation link to <strong style={{ color: 'var(--text-1)' }}>{email}</strong>. Click it to activate your account, then sign in.
            </p>
            <Link href="/auth/login" style={{
              display: 'inline-block', marginTop: 24,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              fontWeight: 800, padding: '10px 24px', borderRadius: 99, fontSize: 13, textDecoration: 'none',
            }}>
              Back to sign in
            </Link>
          </div>
        ) : (
        <>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {(['account', 'profile'] as const).map((s, i) => (
            <div key={s} style={{ flex: 1, height: 3, borderRadius: 99, background: i === 0 || step === 'profile' ? 'var(--accent)' : 'var(--border-2)', transition: 'background 300ms' }} />
          ))}
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 6 }}>
          {step === 'account' ? 'Create account' : 'Set up your profile'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 28 }}>
          {step === 'account' ? 'Join the #1 sports social hub' : 'Tell us about yourself'}
        </p>

        {step === 'account' && (
          <>
            <button type="button" onClick={handleWhop} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '11px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, #FF6243, #E5432A)', border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, fontWeight: 700, color: '#fff',
              cursor: 'pointer', transition: 'all 150ms', marginBottom: 10,
              boxShadow: '0 4px 14px rgba(229,67,42,0.35)',
            }}>
              <img src="https://whop.com/apple-icon.png" alt="" width={18} height={18} style={{ borderRadius: 4 }} />
              Continue with Whop
            </button>
            <button type="button" onClick={handleDiscord} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '11px 20px', borderRadius: 10,
              background: '#5865F2', border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14, fontWeight: 700, color: '#fff',
              cursor: 'pointer', transition: 'all 150ms', marginBottom: 10,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04c-1.7.29-3.36.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 8.7-.32 12.9.1 17.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13c.13-.09.25-.19.37-.28a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.19.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-4.83-.83-9-3.5-12.66a.06.06 0 0 0-.03-.03ZM8.02 14.5c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>
              Continue with Discord
            </button>
            <button type="button" onClick={handleX} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '11px 20px', borderRadius: 10,
              background: '#000', border: '1px solid rgba(255,255,255,0.15)',
              fontSize: 14, fontWeight: 700, color: '#fff',
              cursor: 'pointer', transition: 'all 150ms', marginBottom: 20,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M18.24 2H21.5l-7.3 8.34L22.8 22h-6.75l-5.28-6.9L4.7 22H1.44l7.8-8.92L1 2h6.92l4.78 6.32L18.24 2Zm-1.18 18h1.8L7.02 3.9H5.08l12 16.1Z"/></svg>
              Continue with X
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {step === 'account' ? (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>EMAIL</label>
                <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="ss-input" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>PASSWORD</label>
                <input type="password" placeholder="Min 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="ss-input" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>USERNAME</label>
                <input type="text" placeholder="capper_king" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} required className="ss-input" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>DISPLAY NAME</label>
                <input type="text" placeholder="Your name" value={displayName} onChange={e => setDisplayName(e.target.value)} className="ss-input" />
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10, letterSpacing: '0.02em' }}>SPORTS YOU FOLLOW</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {SPORTS.map(s => {
                    const logo = sportLogoUrl(s)
                    return (
                      <button key={s} type="button" onClick={() => toggleSport(s)} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                        border: `1px solid ${sports.includes(s) ? 'var(--accent)' : 'var(--border-2)'}`,
                        background: sports.includes(s) ? 'var(--accent-dim)' : 'transparent',
                        color: sports.includes(s) ? 'var(--accent)' : 'var(--text-3)',
                        cursor: 'pointer', transition: 'all 130ms',
                      }}>
                        {logo && <img src={logo} alt={s} style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 10, letterSpacing: '0.02em' }}>ACCOUNT TYPE</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([
                    { type: 'user' as const, emoji: '👤', title: 'Fan', desc: 'Follow picks & engage' },
                    { type: 'creator' as const, emoji: '⚡', title: 'Capper', desc: 'Share picks & earn' },
                  ]).map(({ type, emoji, title, desc }) => (
                    <button key={type} type="button" onClick={() => setAccountType(type)} style={{
                      padding: '14px 12px', borderRadius: 10, textAlign: 'left',
                      border: `1px solid ${accountType === type ? 'var(--accent)' : 'var(--border-2)'}`,
                      background: accountType === type ? 'var(--accent-dim)' : 'var(--surface-2)',
                      cursor: 'pointer', transition: 'all 130ms',
                    }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>{emoji}</div>
                      <p style={{ fontSize: 13, fontWeight: 800, color: accountType === type ? 'var(--accent)' : 'var(--text-1)', marginBottom: 2 }}>{title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.2)', fontSize: 13, color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '12px 20px', borderRadius: 10, marginTop: 4,
            background: loading ? 'var(--surface-3)' : 'var(--accent)',
            color: loading ? 'var(--text-3)' : 'var(--accent-fg)',
            fontSize: 14, fontWeight: 800, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 150ms',
          }}>
            {step === 'account' ? 'Continue →' : loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginTop: 20 }}>
          Already have an account?{' '}
          <Link href="/auth/login" style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>Sign in</Link>
        </p>
        </>
        )}
      </div>
    </div>
  )
}
