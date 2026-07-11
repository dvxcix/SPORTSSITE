'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { Spotlight } from '@/components/ui/spotlight'

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
  const router = useRouter()

  function toggleSport(s: string) {
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (step === 'account') { setStep('profile'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
    if (signUpError) { setError(signUpError.message); setLoading(false); return }
    if (data.user) {
      await supabase.from('users').upsert({
        id: data.user.id, email, username,
        display_name: displayName || username,
        sport_preferences: sports, account_type: accountType,
      })
    }
    router.push('/onboarding')
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
                  {SPORTS.map(s => (
                    <button key={s} type="button" onClick={() => toggleSport(s)} style={{
                      padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                      border: `1px solid ${sports.includes(s) ? 'var(--accent)' : 'var(--border-2)'}`,
                      background: sports.includes(s) ? 'var(--accent-dim)' : 'transparent',
                      color: sports.includes(s) ? 'var(--accent)' : 'var(--text-3)',
                      cursor: 'pointer', transition: 'all 130ms',
                    }}>
                      {s}
                    </button>
                  ))}
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
      </div>
    </div>
  )
}
