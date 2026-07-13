'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'motion/react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { Spotlight } from '@/components/ui/spotlight'
import { HoverEffect } from '@/components/ui/card-hover-effect'

// Client-only — Meteors' randomized delays differ between server and client
// render, which React flags as a hydration mismatch otherwise. Same fix
// already used on the login/register/onboarding pages.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

// Deliberately generic/benefit-level descriptions only — no mention of any
// internal signal, formula, or threshold (PWR, shade%, Pikkit, etc.).
// Same rule already applied to member-facing tooltips.
const FEATURES = [
  { title: 'Follow real records', description: 'Track cappers by their actual graded win/loss history — not screenshots or self-reported claims.', link: '/explore' },
  { title: 'Post picks & parlays', description: 'Same-book parlay building, live odds, and payout math built right into the composer.', link: '/auth/register?utm_feature=picks' },
  { title: 'The Dugout', description: 'A live, sortable board of every MLB matchup tonight — odds, splits, and pitch-mix data in one dense view.', link: '/auth/register?utm_feature=dugout' },
  { title: 'Weather Lab', description: 'Ballpark conditions that actually move the numbers — wind, temperature, and altitude, at a glance.', link: '/auth/register?utm_feature=weather' },
  { title: 'Pitcher Report', description: 'See exactly what a starter has thrown lately and who in tonight\'s lineup has been hitting it hard.', link: '/auth/register?utm_feature=pitcher' },
  { title: 'Live scores', description: 'Every game, every league, updating in real time — without leaving the app.', link: '/auth/register?utm_feature=scores' },
  { title: 'Leaderboard', description: 'Real rankings by record, streaks, and per-sport performance — see who\'s actually hot.', link: '/leaderboard' },
  { title: 'Real community', description: 'Channels, groups, and a feed built around sports conversation — not noise.', link: '/auth/register?utm_feature=community' },
]

const STEPS = [
  { n: '1', title: 'Create your account', body: 'Free to join, takes under a minute.' },
  { n: '2', title: 'Follow & personalize', body: 'Pick your teams, follow a few cappers, and your feed builds itself.' },
  { n: '3', title: 'Post, track, win', body: 'Share picks, watch your record build, climb the leaderboard.' },
]

export function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="SlipSurge" style={{ width: 32, height: 32, objectFit: 'contain' }} />
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>Slip<span style={{ color: 'var(--accent)' }}>Surge</span></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/auth/login" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', textDecoration: 'none' }}>Sign in</Link>
          <Link href="/auth/register" style={{
            fontSize: 13, fontWeight: 800, color: 'var(--accent-fg)', background: 'var(--accent)',
            padding: '8px 16px', borderRadius: 8, textDecoration: 'none',
          }}>Get started</Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '5%', left: '50%', transform: 'translateX(-50%)',
          width: 700, height: 700, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,255,77,0.09) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <BackgroundBeams className="opacity-30" />
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <Meteors number={16} className="opacity-50" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: '70px 24px 40px', textAlign: 'center', zIndex: 1 }}
        >
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 58px)', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
            The social hub for<br />sports & picks.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 500, margin: '0 auto 32px' }}>
            Drop picks, build parlays, follow cappers with real graded records, and dig into live stats — all in one place.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/auth/register" style={{
              fontSize: 15, fontWeight: 800, color: 'var(--accent-fg)', background: 'var(--accent)',
              padding: '13px 28px', borderRadius: 10, textDecoration: 'none',
            }}>Create free account</Link>
            <Link href="/auth/login" style={{
              fontSize: 15, fontWeight: 700, color: 'var(--text-1)', background: 'var(--surface-2)',
              border: '1px solid var(--border-2)', padding: '13px 28px', borderRadius: 10, textDecoration: 'none',
            }}>Sign in</Link>
          </div>
        </motion.div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 20px', width: '100%' }}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 4 }}
        >
          Everything in one place
        </motion.h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>No more juggling five different apps to follow the action.</p>
        <HoverEffect items={FEATURES} />
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 900, margin: '10px auto 60px', padding: '0 24px', width: '100%' }}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 28 }}
        >
          How it works
        </motion.h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              style={{ textAlign: 'center' }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16,
                margin: '0 auto 12px', border: '1px solid var(--accent)',
              }}>{s.n}</div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '20px 24px', marginTop: 'auto' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>© {new Date().getFullYear()} SlipSurge</span>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/about" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>About</Link>
            <Link href="/faq" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>FAQ</Link>
            <Link href="/support" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>Support</Link>
            <Link href="/responsible-gambling" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>Responsible Gambling</Link>
            <Link href="/terms" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>Terms</Link>
            <Link href="/privacy" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}>Privacy</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
