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
const TIER_LABEL: Record<TierKey, string> = { basic: 'Basic', advanced: 'Advanced', ultimate: 'Ultimate' }

function TierPill({ tier }: { tier: TierKey }) {
  return (
    <span className={`${styles.tierPill} ${styles[`tier_${tier}`]}`}>{TIER_LABEL[tier]}</span>
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
    <div className={styles.boardMockup}>
      <div className={styles.boardChrome}>
        <span className={`${styles.chromeDot} ${styles.chromeRed}`} />
        <span className={`${styles.chromeDot} ${styles.chromeGold}`} />
        <span className={`${styles.chromeDot} ${styles.chromeGreen}`} />
        <span className={styles.boardTitle}>The Dugout <span>Tonight&apos;s matchups</span></span>
      </div>
      <div className={styles.boardHeader}>
        <span>Matchup</span><span>1st HR</span><span>Anytime HR</span><span>Strikeouts</span>
      </div>
      {DUGOUT_ROWS.map(r => (
        <div key={r.matchup} className={`${styles.boardRow} ${r.hot ? styles.boardRowHot : ''}`}>
          <span>{r.matchup}</span>
          <span className={r.hot ? styles.hotOdd : undefined}>{r.hr1}</span>
          <span>{r.hrAny}</span>
          <span>{r.k}</span>
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
    <div className={styles.faqList}>
      {FAQS.map((f, i) => (
        <div key={f.q} className={`${styles.faqItem} ${open === i ? styles.faqItemOpen : ''}`}>
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className={styles.faqButton}
            aria-expanded={open === i}
          >
            <span>{f.q}</span>
            <motion.span animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.2 }} className={styles.faqChevron}>
              <ChevronDown size={16} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }} className={styles.faqAnswerWrap}
              >
                <p className={styles.faqAnswer}>{f.a}</p>
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
          <Image src="/logo.png" alt="SlipSurge" width={32} height={32} priority className={styles.brandLogo} />
          <span className={styles.brandWordmark}>Slip<span>Surge</span></span>
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
      <div>
      <div className={styles.hero}>
        <div className={styles.heroGlow} />
        <Spotlight className="left-0 top-0" fill="#B4FF4D" />
        <BackgroundBeams className="opacity-30" />
        <div className={styles.heroMeteors}>
          <Meteors number={16} className="opacity-50" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className={styles.heroContent}
        >
          <div className={styles.eyebrow}><span /> Sports research and community, connected</div>
          <h1 className={styles.heroTitle}>
            One place to research,<br /><span className={styles.heroAccent}>track, and talk sports.</span>
          </h1>
          <p className={styles.heroCopy}>
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
          className={styles.booksRow}
        >
          <span className={styles.booksLabel}>Post picks from</span>
          <div className={styles.bookLogos}>
            {['fanduel', 'draftkings', 'betmgm', 'caesars'].map(b => (
              <div key={b} className={styles.bookLogo}>
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
          className={styles.sectionTitle}
        >
          Research tools built for bettors, not analysts
        </motion.h2>
        <p className={styles.sectionCopy}>The full slate in one workspace, without rebuilding the board across five tabs.</p>

        <div className={styles.featureShowcase}>
          <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <TierPill tier="ultimate" />
            <h3 className={styles.featureTitle}>The Dugout</h3>
            <p className={styles.featureCopy}>
              Our proprietary Game Matrix is a live, sortable board of every MLB matchup tonight, with odds, splits, and pitch-mix data in one dense view.
            </p>
            <Link href="/auth/register?utm_feature=dugout" className={styles.inlineLink}>Explore The Dugout <ArrowRight size={14} /></Link>
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}>
            <CometCard>
              <div className={styles.mockupWrap}>
                <DugoutMockup />
              </div>
            </CometCard>
          </motion.div>
        </div>

        <div className={styles.toolGrid}>
          {TOOLS.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link href={t.link} className={styles.cardLink}>
                <div className={`${styles.featureCard} ss-card`}>
                  <div className={styles.cardTopline}>
                    <div className={styles.cardIcon}>{t.icon}</div>
                    <TierPill tier={t.tier} />
                  </div>
                  <h4 className={styles.cardTitle}>{t.title}</h4>
                  <p className={styles.cardCopy}>{t.description}</p>
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
          className={styles.sectionTitle}
        >
          Plus everything a social platform needs
        </motion.h2>
        <p className={styles.sectionCopy}>No more juggling five different apps to follow the action.</p>
        <div className={styles.socialGrid}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              <Link href={f.link} className={styles.cardLink}>
                <div className={`${styles.featureCard} ss-card`}>
                  <div className={styles.cardIcon}>{f.icon}</div>
                  <h4 className={styles.cardTitle}>{f.title}</h4>
                  <p className={styles.cardCopy}>{f.description}</p>
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
          className={`${styles.sectionTitle} ${styles.stepsTitle}`}
        >
          How it works
        </motion.h2>
        <div className={styles.stepsGrid}>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className={styles.step}
            >
              <div className={styles.stepNumber}>{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className={styles.pricingSection}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          className={styles.sectionTitle}
        >
          Start free, then choose the tools you need
        </motion.h2>
        <p className={styles.sectionCopy}>Cancel anytime. Annual plans save more. See the full breakdown before choosing.</p>
        <div className={styles.pricingGrid}>
          {PRICING_TEASER.map(p => (
            <div key={p.tier} className={`${styles.priceCard} ${p.popular ? styles.priceCardPopular : ''} ss-card`}>
              {p.popular && <div className={styles.popularBadge}><Badge variant="popular">Most Popular</Badge></div>}
              <h4>{p.label}</h4>
              <div className={styles.priceValue}>
                <span>{p.price}</span>
                <small>{p.period}</small>
              </div>
              {'trialDays' in p && p.trialDays && (
                <div className={styles.trialBadge}><Badge variant="save">{p.trialDays}-day free trial</Badge></div>
              )}
              <p>{p.tagline}</p>
            </div>
          ))}
        </div>
        <div className={styles.pricingAction}>
          <Link href="/pricing" className={styles.secondaryAction}>See full pricing and annual savings</Link>
        </div>
      </section>

      {/* FAQ */}
      <section className={styles.faqSection}>
        <motion.h2
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          className={`${styles.sectionTitle} ${styles.faqTitle}`}
        >
          Frequently asked questions
        </motion.h2>
        <FaqAccordion />
        <p className={styles.faqMore}>
          <Link href="/faq" className={styles.inlineLink}>See the full FAQ <ArrowRight size={14} /></Link>
        </p>
      </section>

      {/* Final CTA */}
      <section className={styles.finalCtaSection}>
        <motion.div
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4 }}
          className={styles.finalCta}
        >
          <h2>Ready to get in the game?</h2>
          <p>Free to join. Upgrade whenever you want the deeper tools.</p>
          <Link href="/auth/register" className={styles.primaryAction}>Create free account</Link>
        </motion.div>
      </section>

      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>© {new Date().getFullYear()} SlipSurge</span>
          <div className={styles.footerLinks}>
            <Link href="/about">About</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/support">Support</Link>
            <Link href="/responsible-gambling">Responsible Gambling</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
