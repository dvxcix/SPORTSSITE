'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import styles from './LandingPage.module.css'
import { motion, AnimatePresence } from 'motion/react'
import { CloudSun, Activity, Rows3, TrendingUp, ChevronDown, Layers, Radio, Trophy, Users, Megaphone, ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { Spotlight } from '@/components/ui/spotlight'
import { CometCard } from '@/components/ui/comet-card'
import { Badge } from '@/components/ui/badge'
import { BookLogo } from '@/components/BookLogo'

// Client-only — Meteors' randomized delays differ between server and client
// render, which React flags as a hydration mismatch otherwise. Same fix
// already used on the login/register/onboarding pages.
const Meteors = dynamic(() => import('@/components/ui/meteors').then(m => m.Meteors), { ssr: false })

// Deliberately generic/benefit-level descriptions only — no mention of any
// internal signal, formula, or threshold (PWR, shade%, Pikkit, etc.).
// Same rule already applied to member-facing tooltips. Icons + a fixed
// 4-column grid (not HoverEffect's 3-col breakpoint, which split these 4
// into an awkward 3-then-1 row) keep this visually even with the tool bento
// grid above it instead of reading as a leftover plain-text list.
const FEATURES: { icon: React.ReactNode; title: string; description: string; link: string }[] = [
  { icon: <Layers size={18} />, title: 'Post picks & parlays', description: 'Build parlays with live odds and payout math calculated automatically as you compose.', link: '/auth/register?utm_feature=picks' },
  { icon: <Radio size={18} />, title: 'Live scores', description: 'Every game and every update in real time, without leaving the app.', link: '/auth/register?utm_feature=scores' },
  { icon: <Trophy size={18} />, title: 'Leaderboard', description: 'Rankings by public record, streaks, and sport so strong performance is easy to verify.', link: '/leaderboard' },
  { icon: <Users size={18} />, title: 'Real community', description: 'Channels, groups, and a feed built around sports conversation, not noise.', link: '/auth/register?utm_feature=community' },
]

const STEPS = [
  { n: '1', title: 'Create your account', body: 'Free to join, takes under a minute.' },
  { n: '2', title: 'Follow & personalize', body: 'Pick your teams, follow a few cappers, and your feed builds itself.' },
  { n: '3', title: 'Post, track, win', body: 'Share picks, watch your record build, climb the leaderboard.' },
]

type TierKey = 'basic' | 'advanced' | 'ultimate'
const TIER_STYLE: Record<TierKey, { color: string; background: string; border: string }> = {
  basic: { color: '#4d9eff', background: 'rgba(77, 158, 255, 0.1)', border: 'rgba(77, 158, 255, 0.28)' },
  advanced: { color: '#ff4d6a', background: 'rgba(255, 77, 106, 0.1)', border: 'rgba(255, 77, 106, 0.28)' },
  ultimate: { color: '#39d9ff', background: 'rgba(57, 217, 255, 0.1)', border: 'rgba(57, 217, 255, 0.3)' },
}
const TIER_LABEL: Record<TierKey, string> = { basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

function TierPill({ tier }: { tier: TierKey }) {
  const palette = TIER_STYLE[tier]
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
      color: palette.color, background: palette.background, border: `1px solid ${palette.border}`,
      borderRadius: 999, padding: '3px 9px',
    }}>{TIER_LABEL[tier]}</span>
  )
}

const TOOLS: { icon: React.ReactNode; title: string; description: string; tier: TierKey; link: string }[] = [
  { icon: <CloudSun size={18} />, title: 'Weather Lab', description: 'See wind, temperature, altitude, and game conditions in one focused view.', tier: 'basic', link: '/auth/register?utm_feature=weather' },
  { icon: <Activity size={18} />, title: 'Pitcher Report', description: 'See exactly what a starter has thrown lately and who in tonight\'s lineup has been hitting it hard.', tier: 'basic', link: '/auth/register?utm_feature=pitcher' },
  { icon: <Rows3 size={18} />, title: 'Slate Breakdown', description: 'Every pitcher and batter matchup on tonight\'s slate, laid out side by side before first pitch.', tier: 'advanced', link: '/auth/register?utm_feature=slate' },
  { icon: <TrendingUp size={18} />, title: 'Batter Cost', description: 'Compare opening and current prices across the slate without rebuilding the board by hand.', tier: 'ultimate', link: '/auth/register?utm_feature=batter-cost' },
  { icon: <Megaphone size={18} />, title: 'The Public', description: 'See where community attention is concentrated across players and prop markets.', tier: 'advanced', link: '/auth/register?utm_feature=public' },
]

// Illustrative mockup only — not a live screenshot. Team pairs and numbers
// below are placeholders (no real player names or live data), built to show
// the shape of the real Dugout table (matchup rows, heat-mapped odds
// columns) without depending on there being live games right now or
// exposing any real user-posted content on a logged-out marketing page.
const DUGOUT_ROWS = [
  { matchup: 'NYY @ BOS', hr1: '+650', hrAny: '+140', k: '-115', hot: true },
  { matchup: 'LAD @ SF', hr1: '+800', hrAny: '+165', k: '-105', hot: false },
  { matchup: 'ATL @ NYM', hr1: '+575', hrAny: '+125', k: '-130', hot: false },
]

function DugoutMockup() {
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />
        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>The Dugout | Tonight&apos;s matchups</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '8px 14px', fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
        <span>Matchup</span><span>1st HR</span><span>Anytime HR</span><span>Strikeouts</span>
      </div>
      {DUGOUT_ROWS.map(r => (
        <div key={r.matchup} style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '9px 14px', fontSize: 12,
          background: r.hot ? 'var(--accent-dim)' : 'transparent', borderTop: '1px solid var(--border)',
          color: 'var(--text-1)', fontWeight: 600,
        }}>
          <span>{r.matchup}</span>
          <span style={{ color: r.hot ? 'var(--accent)' : 'var(--text-2)' }}>{r.hr1}</span>
          <span style={{ color: 'var(--text-2)' }}>{r.hrAny}</span>
          <span style={{ color: 'var(--text-2)' }}>{r.k}</span>
        </div>
      ))}
    </div>
  )
}

const PRICING_TEASER = [
  { tier: 'free' as const, label: 'Free', price: '$0', period: '', tagline: 'Browse the community & your profile.' },
  { tier: 'basic' as const, label: 'Basic', price: '$9.99', period: '/mo', tagline: 'Community, research, live scores.' },
  // trialDays is monthly-plan-only (confirmed against the real Whop plan
  // config) — this teaser only ever shows the monthly price, so it's always
  // safe to show here without an interval check like /pricing needs.
  { tier: 'advanced' as const, label: 'Advanced', price: '$24.99', period: '/mo', tagline: 'Everything in Basic + Slate Breakdown.', trialDays: 7 },
  { tier: 'ultimate' as const, label: 'Ultimate', price: '$34.99', period: '/mo', tagline: 'Every tool, including The Dugout and The Public.', popular: true, trialDays: 3 },
]

const FAQS = [
  { q: 'Is SlipSurge a sportsbook? Can I place real bets here?', a: 'No. SlipSurge is a social platform for sharing and following picks. We never accept wagers or hold funds for betting. Place actual bets through a licensed sportsbook in your jurisdiction.' },
  { q: 'How do I follow a capper\'s record?', a: 'Follow anyone from their profile. Their picks land in your feed automatically, and their record updates when each pick grades. No screenshots or self-reported win rates.' },
  { q: 'How does parlay grading work?', a: 'Each leg grades independently against the final box score. A parlay only shows WIN once every leg has graded. Any single loss fails the whole slip, while an all-push result is graded as a push.' },
  { q: 'What\'s free vs. what requires a paid tier?', a: 'Creating an account, browsing the feed, and managing your own profile are always free. The community (posting, DMs, groups), player research, live scores, and our analytics tools (Weather Lab, Pitcher Report, Slate Breakdown, The Dugout, The Public) are unlocked across Basic, Advanced, and Ultimate.' },
]

function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {FAQS.map((f, i) => (
        <div key={f.q} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '16px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{f.q}</span>
            <motion.span animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ flexShrink: 0, color: 'var(--text-3)' }}>
              <ChevronDown size={16} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }} style={{ overflow: 'hidden' }}
              >
                <p style={{ padding: '0 18px 16px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>{f.a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Nav */}
      <header className={styles.nav}>
        <Link href="/" className={styles.brand} aria-label="SlipSurge home">
          <Image src="/logo.png" alt="SlipSurge" width={32} height={32} priority style={{ objectFit: 'contain' }} />
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>Slip<span style={{ color: 'var(--accent)' }}>Surge</span></span>
        </Link>
        <nav className={styles.primaryNav} aria-label="Product navigation">
          <a href="#research">Research</a>
          <a href="#community">Community</a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <nav className={styles.actions} aria-label="Public navigation">
          <Link href="/pricing" className={`${styles.link} ${styles.pricing}`}>Pricing</Link>
          <Link href="/auth/login" className={styles.link}>Sign in</Link>
          <Link href="/auth/register" className={styles.cta}>Get started</Link>
        </nav>
      </header>

      {/* Hero */}
      <main>
      <div className={styles.hero}>
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
          className={styles.heroContent}
        >
          <div className={styles.eyebrow}><span /> Sports research and community, connected</div>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 58px)', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
            One place to research,<br /><span className={styles.heroAccent}>track, and talk sports.</span>
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 560, margin: '0 auto 32px' }}>
            Follow live markets, compare the full slate, publish picks, and see public records update automatically.
          </p>
          <div className={styles.heroActions}>
            <Link href="/auth/register" className={styles.heroPrimary}>Create free account <ArrowRight size={16} /></Link>
            <Link href="/pricing" className={styles.heroSecondary}>Compare memberships</Link>
          </div>
          <div className={styles.heroProof} aria-label="Platform highlights">
            <span><CheckCircle2 size={14} /> Free account</span>
            <span><CheckCircle2 size={14} /> Automatic grading</span>
            <span><ShieldCheck size={14} /> Whop-powered memberships</span>
          </div>
        </motion.div>

        {/* Real sportsbooks trust row — same book set/logos used throughout
            the app (BookLogo), not a fabricated "as seen on" claim. */}
        <motion.div
          initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: 0.15 }}
          style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '0 24px 56px', flexWrap: 'wrap' }}
        >
          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Post picks from</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {['fanduel', 'draftkings', 'betmgm', 'caesars'].map(b => (
              <div key={b} style={{ width: 22, height: 22, borderRadius: 5, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookLogo vendor={b} size={16} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Flagship tool showcase */}
      <section id="research" className={styles.section}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 4 }}
        >
          Research tools built for bettors, not analysts
        </motion.h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginBottom: 32 }}>The full slate in one workspace, without rebuilding the board across five tabs.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', gap: 24, alignItems: 'center', marginBottom: 20 }} className="ss-landing-grid">
          <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <TierPill tier="ultimate" />
            <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)', margin: '10px 0 8px' }}>The Dugout</h3>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 16 }}>
              Our proprietary Game Matrix is a live, sortable board of every MLB matchup tonight, with odds, splits, and pitch-mix data in one dense view.
            </p>
            <Link href="/auth/register?utm_feature=dugout" className={styles.inlineLink}>Explore The Dugout <ArrowRight size={14} /></Link>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <CometCard>
              <div style={{ width: '100%' }}>
                <DugoutMockup />
              </div>
            </CometCard>
          </motion.div>
        </div>

        <div className="ss-5col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
          {TOOLS.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link href={t.link} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                <div className="ss-card" style={{ padding: 18, height: '100%', borderRadius: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{t.icon}</div>
                    <TierPill tier={t.tier} />
                  </div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{t.title}</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{t.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Everything else */}
      <section id="community" className={styles.section}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 4 }}
        >
          Plus everything a social platform needs
        </motion.h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginBottom: 32 }}>No more juggling five different apps to follow the action.</p>
        <div className="ss-4col-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link href={f.link} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                <div className="ss-card" style={{ padding: 18, height: '100%', borderRadius: 14 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>{f.icon}</div>
                  <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{f.title}</h4>
                  <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{f.description}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className={`${styles.section} ${styles.stepsSection}`}>
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
      </section>

      {/* Pricing teaser */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px 24px 40px', width: '100%' }}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 4 }}
        >
          Start free, then choose the tools you need
        </motion.h2>
        <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginBottom: 28 }}>Cancel anytime. Annual plans save more. See the full breakdown before choosing.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {PRICING_TEASER.map(p => (
            <div key={p.tier} className="ss-card" style={{
              padding: 20, borderRadius: 14, position: 'relative',
              borderColor: p.popular ? 'var(--accent)' : undefined,
            }}>
              {p.popular && <div style={{ position: 'absolute', top: -10, left: 20 }}><Badge variant="popular">Most Popular</Badge></div>}
              <h4 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 8 }}>{p.label}</h4>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)' }}>{p.price}</span>
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{p.period}</span>
              </div>
              {'trialDays' in p && p.trialDays && (
                <div style={{ marginBottom: 8 }}><Badge variant="save">{p.trialDays}-day free trial</Badge></div>
              )}
              <p style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>{p.tagline}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/pricing" style={{
            fontSize: 14, fontWeight: 800, color: 'var(--text-1)', background: 'var(--surface-2)',
            border: '1px solid var(--border-2)', padding: '11px 24px', borderRadius: 10, textDecoration: 'none',
          }}>See full pricing and annual savings</Link>
        </div>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 40px', width: '100%' }}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', textAlign: 'center', marginBottom: 24 }}
        >
          Frequently asked questions
        </motion.h2>
        <FaqAccordion />
        <p style={{ textAlign: 'center', marginTop: 20 }}>
          <Link href="/faq" className={styles.inlineLink}>See the full FAQ <ArrowRight size={14} /></Link>
        </p>
      </div>

      {/* Final CTA */}
      <div style={{ maxWidth: 1100, margin: '0 auto 60px', padding: '0 24px', width: '100%' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          style={{
            textAlign: 'center', padding: '48px 24px', borderRadius: 20,
            background: 'linear-gradient(180deg, var(--accent-dim), transparent)',
            border: '1px solid var(--border-2)',
          }}
        >
          <h2 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', marginBottom: 12 }}>Ready to get in the game?</h2>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>Free to join. Upgrade whenever you want the deeper tools.</p>
          <Link href="/auth/register" style={{
            fontSize: 15, fontWeight: 800, color: 'var(--accent-fg)', background: 'var(--accent)',
            padding: '13px 28px', borderRadius: 10, textDecoration: 'none',
          }}>Create free account</Link>
        </motion.div>
      </div>

      </main>

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
