'use client'

import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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

  async function handleGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${next}` },
    })
  }

  function handleWhop() {
    location.href = `/auth/whop/login?next=${encodeURIComponent(next)}`
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
        {/* Background glow */}
        <div style={{
          position: 'absolute', top: '30%', left: '20%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,255,77,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
            <img src="/logo.png" alt="SlipSurge" style={{ width: 44, height: 44, objectFit: 'contain' }} />
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              Slip<span style={{ color: 'var(--accent)' }}>Surge</span>
            </div>
          </div>
          <h2 style={{ fontSize: 36, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.15, letterSpacing: '-0.03em', marginBottom: 16 }}>
            The social hub<br />for sports & picks.
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 360 }}>
            Drop picks, follow cappers, watch live scores, join channels — all in one place.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 40 }}>
            {['🏆 Follow top cappers & track their records', '📊 Share picks with odds & get graded', '⚡ Live scores, channels & community feeds', '💰 Subscribe to premium creators'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text-2)' }}>
                {f}
              </div>
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
