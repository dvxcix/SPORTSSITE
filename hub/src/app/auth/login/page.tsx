'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { Highlight } from '@/components/ui/hero-highlight'

// Meteors picks random delays/durations at render time — fine for a purely
// decorative background, but that randomness differs between the server
// render and the client render and React flags it as a hydration mismatch.
// Client-only (no SSR) sidesteps that entirely rather than trying to seed
// matching randomness on both sides.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

const featureVariants = {
  hidden: { opacity: 0, x: -8 },
  show: (i: number) => ({ opacity: 1, x: 0, transition: { delay: 0.5 + i * 0.09, duration: 0.35 } }),
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  whop_no_access: "That Whop account doesn't have an active subscription for SlipSurge access. Check your subscription on Whop and try again.",
  whop_auth_failed: 'Whop sign-in failed. Please try again.',
  auth_failed: 'Sign-in failed. Please try again.',
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPhone, setShowPhone] = useState(false)
  const [phone, setPhone] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneStep, setPhoneStep] = useState<'number' | 'code'>('number')
  const [phoneError, setPhoneError] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/feed'
  const oauthError = searchParams.get('error')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push(next)
    router.refresh()
  }

  // Discord/X/Apple all use Supabase's standard OAuth flow, same as Google —
  // no custom callback route needed (unlike Whop, which has no native
  // Supabase provider). Each just needs enabling in the Supabase dashboard
  // (Authentication > Providers) with that platform's own app credentials.
  function oauthHandler(provider: 'google' | 'discord' | 'x' | 'apple') {
    return async () => {
      const supabase = createClient()
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${location.origin}/auth/callback?next=${next}` },
      })
    }
  }
  const handleGoogle = oauthHandler('google')
  const handleDiscord = oauthHandler('discord')
  // Supabase's modern X provider slot is 'x' (OAuth 2.0), distinct from the
  // legacy deprecated 'twitter' (OAuth 1.0a) — the X developer portal
  // pushes new apps toward OAuth 2.0 Client ID/Secret by default, which maps
  // to Supabase's "X / Twitter (OAuth 2.0)" toggle, not "Twitter (OAuth 1.0a)".
  const handleX = oauthHandler('x')
  const handleApple = oauthHandler('apple')

  function handleWhop() {
    location.href = `/auth/whop/login?next=${encodeURIComponent(next)}`
  }

  // Phone sign-in has no redirect step — verifyOtp() turns the SMS code
  // straight into a session in the browser, same mechanism email/password
  // login uses. Requires an SMS provider (Twilio etc.) configured in
  // Supabase's Auth settings; until then this 400s with a clear error.
  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setPhoneLoading(true)
    setPhoneError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ phone })
    setPhoneLoading(false)
    if (error) { setPhoneError(error.message); return }
    setPhoneStep('code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setPhoneLoading(true)
    setPhoneError('')
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ phone, token: phoneCode, type: 'sms' })
    if (error) { setPhoneError(error.message); setPhoneLoading(false); return }
    router.push(next)
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      background: 'var(--bg)',
    }}>
      {/* Left panel — brand */}
      <div style={{
        flex: 1, display: 'none', flexDirection: 'column', justifyContent: 'center',
        padding: '60px', background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
      }} className="lg:flex">
        {/* Background glow + animated beams/meteors */}
        <div style={{
          position: 'absolute', top: '30%', left: '20%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,255,77,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <BackgroundBeams className="opacity-40" />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Meteors number={14} className="opacity-70" />
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <img src="/logo.png" alt="SlipSurge" style={{ width: 44, height: 44, objectFit: 'contain' }} />
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              Slip<span style={{ color: 'var(--accent)' }}>Surge</span>
            </div>
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 16 }}>
            The social hub for{' '}
            <Highlight className="text-black bg-gradient-to-r from-[#B4FF4D] to-[#E8FF9E] dark:from-[#B4FF4D] dark:to-[#E8FF9E]">
              sports & picks.
            </Highlight>
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 360 }}>
            Drop picks, follow cappers, watch live scores, join channels — all in one place.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 40 }}>
            {['🏆 Follow top cappers & track their records', '📊 Share picks with odds & get graded', '⚡ Live scores, channels & community feeds', '💰 Subscribe to premium creators'].map((f, i) => (
              <motion.div key={f} custom={i} initial="hidden" animate="show" variants={featureVariants}
                style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text-2)' }}>
                {f}
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '40px 48px',
      }} className="lg:w-[460px]">
        {/* Mobile logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }} className="lg:hidden">
          <img src="/logo.png" alt="SlipSurge" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>Slip<span style={{ color: 'var(--accent)' }}>Surge</span></span>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em', marginBottom: 6 }}>Welcome back</h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 32 }}>Sign in to your account to continue</p>

        {/* Google */}
        <button onClick={handleGoogle} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 20px', borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border-2)',
          fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
          cursor: 'pointer', transition: 'all 150ms', marginBottom: 20,
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-3)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Whop — branded orange, matches Whop's own accent color */}
        <button onClick={handleWhop} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 20px', borderRadius: 10,
          background: 'linear-gradient(135deg, #FF6243, #E5432A)', border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 14, fontWeight: 700, color: '#fff',
          cursor: 'pointer', transition: 'all 150ms', marginBottom: 20,
          boxShadow: '0 4px 14px rgba(229,67,42,0.35)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #FF7355, #EF4E33)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'linear-gradient(135deg, #FF6243, #E5432A)')}>
          <img src="https://whop.com/apple-icon.png" alt="" width={18} height={18} style={{ borderRadius: 4 }} />
          Continue with Whop
        </button>

        {/* Discord — brand blurple */}
        <button onClick={handleDiscord} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 20px', borderRadius: 10,
          background: '#5865F2', border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 14, fontWeight: 700, color: '#fff',
          cursor: 'pointer', transition: 'all 150ms', marginBottom: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#6570F5')}
        onMouseLeave={e => (e.currentTarget.style.background = '#5865F2')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.26a18.3 18.3 0 0 0-5.48 0 12.6 12.6 0 0 0-.62-1.26.08.08 0 0 0-.08-.04c-1.7.29-3.36.8-4.89 1.52a.07.07 0 0 0-.03.03C.53 8.7-.32 12.9.1 17.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13c.13-.09.25-.19.37-.28a.07.07 0 0 1 .08-.01c3.93 1.8 8.18 1.8 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.19.37.29a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.11c.36.7.78 1.37 1.23 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-4.83-.83-9-3.5-12.66a.06.06 0 0 0-.03-.03ZM8.02 14.5c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.09-2.16-2.42 0-1.34.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"/></svg>
          Continue with Discord
        </button>

        {/* X — matches its own black/white brand treatment regardless of app theme */}
        <button onClick={handleX} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 20px', borderRadius: 10,
          background: '#000', border: '1px solid rgba(255,255,255,0.15)',
          fontSize: 14, fontWeight: 700, color: '#fff',
          cursor: 'pointer', transition: 'all 150ms', marginBottom: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#000')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M18.24 2H21.5l-7.3 8.34L22.8 22h-6.75l-5.28-6.9L4.7 22H1.44l7.8-8.92L1 2h6.92l4.78 6.32L18.24 2Zm-1.18 18h1.8L7.02 3.9H5.08l12 16.1Z"/></svg>
          Continue with X
        </button>

        {/* Apple — always black-pill/white-text per Apple's Sign in with Apple guidelines */}
        <button onClick={handleApple} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 20px', borderRadius: 10,
          background: '#000', border: '1px solid rgba(255,255,255,0.15)',
          fontSize: 14, fontWeight: 700, color: '#fff',
          cursor: 'pointer', transition: 'all 150ms', marginBottom: 10,
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
        onMouseLeave={e => (e.currentTarget.style.background = '#000')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M16.36 1c.12 1.02-.28 2.02-.9 2.76-.64.76-1.68 1.35-2.7 1.27-.14-1 .34-2.04.94-2.7C14.36 1.53 15.4 1.03 16.36 1Zm3.36 16.98c-.35.8-.77 1.55-1.28 2.24-.72.98-1.63 2.2-2.85 2.21-1.08.02-1.36-.7-2.83-.7-1.47 0-1.8.68-2.83.72-1.2.04-2.14-1.08-2.86-2.05-1.55-2.12-2.75-6-1.15-8.62.8-1.32 2.22-2.15 3.76-2.17 1.16-.02 2.25.79 2.96.79.7 0 2.03-.98 3.42-.83.58.02 2.22.24 3.28 1.78-.08.05-1.96 1.15-1.94 3.43.02 2.72 2.37 3.63 2.4 3.64-.02.06-.38 1.3-1.28 2.56Z"/></svg>
          Continue with Apple
        </button>

        {/* Phone — inline toggle instead of a redirect, since it's a two-step
            code exchange rather than an OAuth handoff */}
        {!showPhone ? (
          <button type="button" onClick={() => setShowPhone(true)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            padding: '11px 20px', borderRadius: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border-2)',
            fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
            cursor: 'pointer', transition: 'all 150ms', marginBottom: 20,
          }}>
            📱 Continue with phone
          </button>
        ) : (
          <div style={{ padding: 14, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-2)', marginBottom: 20 }}>
            {phoneStep === 'number' ? (
              <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="tel" placeholder="+1 555 555 0100" value={phone} onChange={e => setPhone(e.target.value)} required className="ss-input" />
                {phoneError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{phoneError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowPhone(false)} style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button type="submit" disabled={phoneLoading} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', fontSize: 13, fontWeight: 800, cursor: phoneLoading ? 'not-allowed' : 'pointer', opacity: phoneLoading ? 0.6 : 1 }}>
                    {phoneLoading ? 'Sending…' : 'Send code'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Code sent to {phone}</p>
                <input type="text" inputMode="numeric" placeholder="123456" value={phoneCode} onChange={e => setPhoneCode(e.target.value)} required className="ss-input" />
                {phoneError && <div style={{ fontSize: 12, color: 'var(--red)' }}>{phoneError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setPhoneStep('number')} style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--border-2)', color: 'var(--text-3)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Back</button>
                  <button type="submit" disabled={phoneLoading} style={{ flex: 1, padding: '9px 16px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', fontSize: 13, fontWeight: 800, cursor: phoneLoading ? 'not-allowed' : 'pointer', opacity: phoneLoading ? 0.6 : 1 }}>
                    {phoneLoading ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {oauthError && OAUTH_ERROR_MESSAGES[oauthError] && (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--red-dim)', border: '1px solid rgba(255,77,106,0.2)', fontSize: 13, color: 'var(--red)', marginBottom: 20 }}>
            {OAUTH_ERROR_MESSAGES[oauthError]}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>EMAIL</label>
            <input
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required
              className="ss-input"
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6, letterSpacing: '0.02em' }}>PASSWORD</label>
            <input
              type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} required
              className="ss-input"
            />
          </div>

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
          }}
          onMouseEnter={e => { if (!loading) (e.currentTarget.style.background = '#C8FF6A') }}
          onMouseLeave={e => { if (!loading) (e.currentTarget.style.background = 'var(--accent)') }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <Link href="/auth/forgot-password" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-2)')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-3)')}>
            Forgot password?
          </Link>
          <Link href="/auth/register" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
            Create account →
          </Link>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 40, lineHeight: 1.5 }}>
          By signing in you agree to our <Link href="/terms" style={{ color: 'var(--text-3)' }}>Terms</Link> and <Link href="/privacy" style={{ color: 'var(--text-3)' }}>Privacy Policy</Link>.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
