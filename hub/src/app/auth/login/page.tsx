'use client'

import { Suspense, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'motion/react'
import { safeInternalPath } from '@/lib/safeRedirect'
import Image from 'next/image'
import { AuthAlert, AuthBrand, AuthDivider, AuthExperience, AuthField, AuthHeading, AuthSubmit, ProviderButton, authExperienceStyles as auth } from '@/components/auth/AuthExperience'

const featureVariants = {
  hidden: { opacity: 0, x: -8 },
  show: (i: number) => ({ opacity: 1, x: 0, transition: { delay: 0.5 + i * 0.09, duration: 0.35 } }),
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  whop_no_access: "That Whop account doesn't have an active subscription for SlipSurge access. Check your subscription on Whop and try again.",
  whop_auth_failed: 'Whop sign-in failed. Please try again.',
  auth_failed: 'Sign-in failed. Please try again.',
  profile_setup_failed: 'Signed in, but we couldn\'t finish setting up your account. Please try again — contact support if it keeps happening.',
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = safeInternalPath(searchParams.get('next'))
  const isDesktop = searchParams.get('platform') === 'desktop' ||
    (typeof navigator !== 'undefined' && navigator.userAgent.includes('SlipSurgeDesktop/'))
  const oauthError = searchParams.get('error')

  const [hashErrorDescription, setHashErrorDescription] = useState('')
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const description = hash.get('error_description')
    if (description) window.queueMicrotask(() => setHashErrorDescription('Sign-in failed. Please try again.'))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError('Email or password is incorrect.'); return }
      router.push(next)
      router.refresh()
    } catch {
      setError('Sign-in is unavailable. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Discord/X use Supabase's standard OAuth flow — no custom callback route
  // needed (unlike Whop, which has no native Supabase provider). Each just
  // needs enabling in the Supabase dashboard (Authentication > Providers)
  // with that platform's own app credentials.
  function oauthHandler(provider: 'discord' | 'x') {
    return async () => {
      if (isDesktop) {
        const desktopState = crypto.randomUUID()
        localStorage.setItem('slipsurge_desktop_oauth_state', desktopState)
        router.push(`/auth/desktop/start?provider=${provider}&next=${encodeURIComponent(next)}&state=${encodeURIComponent(desktopState)}`)
        return
      }
      try {
        const supabase = createClient()
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        })
        if (error) setError('Could not start sign-in. Try again.')
      } catch {
        setError('Could not start sign-in. Try again.')
      }
    }
  }
  const handleDiscord = oauthHandler('discord')
  // Supabase's modern X provider slot is 'x' (OAuth 2.0), distinct from the
  // legacy deprecated 'twitter' (OAuth 1.0a) — the X developer portal
  // pushes new apps toward OAuth 2.0 Client ID/Secret by default, which maps
  // to Supabase's "X / Twitter (OAuth 2.0)" toggle, not "Twitter (OAuth 1.0a)".
  const handleX = oauthHandler('x')

  function handleWhop() {
    if (isDesktop) {
      const desktopState = crypto.randomUUID()
      localStorage.setItem('slipsurge_desktop_oauth_state', desktopState)
      router.push(`/auth/desktop/start?provider=whop&next=${encodeURIComponent(next)}&state=${encodeURIComponent(desktopState)}`)
      return
    }
    router.push(`/auth/whop/login?next=${encodeURIComponent(next)}`)
  }

  return (
    <AuthExperience aside={
      <>
        <AuthBrand />
        <h2 className={auth.asideTitle}>
            The social hub for{' '}
            <span>
              sports & picks.
            </span>
        </h2>
        <p className={auth.asideCopy}>Drop picks, follow cappers, watch live scores, join channels — all in one place.</p>
        <div className={auth.asideList}>
          {['Follow top cappers and track public records', 'Share picks with odds and automatic grading', 'Live scores, channels, and community feeds', 'Subscribe to premium creators'].map((feature, index) => (
            <motion.div key={feature} custom={index} initial="hidden" animate="show" variants={featureVariants}>{feature}</motion.div>
          ))}
        </div>
      </>
    }>
        <AuthHeading title="Welcome back" description="Sign in to your account to continue" />

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

        {(hashErrorDescription || (oauthError && OAUTH_ERROR_MESSAGES[oauthError])) && (
          <div className={auth.oauthAlert}><AuthAlert>
            {hashErrorDescription?.toLowerCase().includes('email')
              ? "Your X account isn't associated with an email address. Please log in to X and add an email to your account before using it to sign in or sign up on SlipSurge."
              : hashErrorDescription || OAUTH_ERROR_MESSAGES[oauthError!]}
          </AuthAlert></div>
        )}

        <AuthDivider />

        <form onSubmit={handleLogin} className={auth.form}>
          <AuthField label="Email">
            <input
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} required maxLength={254} autoComplete="email"
              className="ss-input"
            />
          </AuthField>
          <AuthField label="Password">
            <input
              type="password" placeholder="••••••••" value={password}
              onChange={e => setPassword(e.target.value)} required maxLength={128} autoComplete="current-password"
              className="ss-input"
            />
          </AuthField>

          {error && <AuthAlert>{error}</AuthAlert>}

          <AuthSubmit disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</AuthSubmit>
        </form>

        <div className={auth.authLinks}>
          <Link href="/auth/forgot-password">Forgot password?</Link>
          <Link href="/auth/register">Create account →</Link>
        </div>

        <p className={auth.legal}>
          By signing in you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
    </AuthExperience>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="ss-route-loading"><span>Loading…</span></div>}>
      <LoginForm />
    </Suspense>
  )
}
