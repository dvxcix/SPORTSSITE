import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, ChevronDown } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { sportTeamBackground, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { PREVIEW_CONFIG } from '@/lib/publicResearchPreview'
import { ResearchShowcase } from './ResearchShowcase'
import styles from './LandingPage.module.css'

const portraits = [
  { sport: 'nfl', team: 'TB', name: 'Cade Otton', portrait: 'https://static.www.nfl.com/image/upload/t_player_profile_landscape/f_auto/league/yanr6h9aplae3jyzimf7', value: '25', unit: 'receiving yards' },
  { sport: 'nba', team: 'LAL', name: 'Austin Reaves', portrait: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630559.png', value: '43', unit: 'points' },
] as const

const community = [
  { title: 'Post picks and parlays', copy: 'Build a slip with saved prices and see each leg grade against the result.', href: '/auth/register?utm_feature=picks' },
  { title: 'Follow the scores', copy: 'Keep up with games and box scores alongside your research.', href: '/auth/register?utm_feature=scores' },
  { title: 'Check public records', copy: 'Browse the leaderboard by sport, record and streak.', href: '/leaderboard' },
  { title: 'Follow the community', copy: 'Find people to follow and join the conversation in groups and channels.', href: '/auth/register?utm_feature=community' },
]

const faqs = [
  { q: 'Can I try the boards without an account?', a: 'Yes. The NBA and NFL previews each have a featured matchup, one market and FanDuel prices. You can change the player and line and compare each saved price with its opening.' },
  { q: 'What comes with Ultimate?', a: 'Both research workspaces come with one membership. You get the full available odds boards, more markets and sportsbooks, saved pregame history, NBA projections and defense by position, and NFL matchup research and public pick counts where available.' },
  { q: 'How do picks and parlays grade?', a: 'Each leg grades against the final box score. A parlay wins when all legs win or push and at least one leg wins. A losing leg loses the parlay, and an all-push parlay grades as a push.' },
  { q: 'Can I place a bet on SlipSurge?', a: 'SlipSurge is a research and community platform. It does not accept wagers or hold betting funds.' },
]

function PlayerCards() {
  return (
    <figure className={styles.playerFigure}>
      <div className={styles.playerStage}>
        <svg className={styles.courtLines} viewBox="0 0 560 410" fill="none" aria-hidden="true">
          <path d="M-48 202 267 24l340 160-318 183L-48 202Z M103 116l340 162 M55 144l79-45 88 43-78 45L55 144Z M390 244l78-44 86 40-76 45-88-41Z" />
          <ellipse cx="273" cy="194" rx="80" ry="38" transform="rotate(25 273 194)" />
        </svg>
        {portraits.map(({ sport, team, name, portrait, value, unit }) => {
          const logo = sportTeamLogoUrl(sport, team)
          return (
            <div key={sport} className={sport === 'nba' ? styles.nbaCard : styles.nflCard}>
              <div className={styles.playerCard} style={{ background: sportTeamBackground(sport, team) }}>
                <div className={styles.cardHeader}>
                  <span>{PREVIEW_CONFIG[sport].workspace}</span>
                  {logo && <Image src={logo} width={29} height={29} alt="" unoptimized />}
                </div>
                <Image className={styles.portrait} src={portrait} alt="" width={400} height={300} sizes="(max-width: 600px) 42vw, 260px" unoptimized />
                <div className={styles.cardInfo}>
                  <span>{name}</span>
                  <div><strong>{value}</strong> <span>{unit}</span></div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <figcaption>Nov 8, 2026 · Final box scores</figcaption>
    </figure>
  )
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="SlipSurge home">
            <Image src="/logo.png" alt="" width={30} height={30} preload />
            <span>Slip<span>Surge</span></span>
          </Link>
          <nav className={styles.primaryNav} aria-label="Product navigation">
            <a href="#research">Research</a>
            <a href="#community">Community</a>
            <a href="#membership">Membership</a>
          </nav>
          <nav className={styles.navActions} aria-label="Account">
            <Link href="/auth/login" className={styles.textLink}>Sign in</Link>
            <Link href="/pricing" className={styles.secondaryButton}>View plans</Link>
          </nav>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>NBA and NFL research</p>
          <h1 id="landing-title">See how the odds moved</h1>
          <p className={styles.lede}>Compare opening and saved prices, research the matchup, then check what the player actually did.</p>
          <div className={styles.actions}>
            <a href="#research" className={styles.primaryButton}>Try a free board <ArrowRight size={17} /></a>
            <a href="#membership" className={styles.textLink}>What’s in Ultimate</a>
          </div>
          <p className={styles.note}>Free previews open without an account.</p>
        </div>
        <PlayerCards />
      </section>

      <section id="research" className={styles.section} aria-labelledby="research-title">
        <div className={styles.sectionIntro}>
          <p className={styles.kicker}>The research desk</p>
          <h2 id="research-title">Try a saved pregame board</h2>
          <p>Pick a sport and a milestone to see how each player’s FanDuel price changed before tip or kickoff.</p>
        </div>
        <ResearchShowcase />
      </section>

      <section id="how-it-works" className={styles.section} aria-labelledby="workflow-title">
        <div className={styles.sectionIntro}>
          <h2 id="workflow-title">From the opening line to the box score</h2>
        </div>
        <ol className={styles.workflow}>
          <li><span>01</span><h3>See the move</h3><p>Compare the same player, book and milestone against its opening price across the available slate.</p></li>
          <li><span>02</span><h3>Research the matchup</h3><p>Check projections, player trends and defense by position in The Court. In The Sideline, look at usage, matchup splits and public picks.</p></li>
          <li><span>03</span><h3>Review the result</h3><p>Reopen saved pregame boards and compare the prices you saw before the game with the final result.</p></li>
        </ol>
      </section>

      <section id="membership" className={styles.section} aria-labelledby="membership-title">
        <div className={styles.sectionIntro}>
          <h2 id="membership-title">One membership for both sports</h2>
          <p>Try a matchup in each sport first. Ultimate gives you both research workspaces.</p>
        </div>
        <div className={styles.plans}>
          <div className={styles.plan}>
            <h3>Free</h3>
            <p className={styles.price}>$0</p>
            <ul className={styles.planFeatures}>
              <li><Check size={16} /> One featured game per preview</li>
              <li><Check size={16} /> NBA points and NFL receiving yards</li>
              <li><Check size={16} /> Feed, favorites and public records with an account</li>
            </ul>
            <a href="#research" className={styles.secondaryButton}>Try the free boards <ArrowRight size={16} /></a>
          </div>
          <div className={styles.plan}>
            <h3>Ultimate</h3>
            <p className={styles.price}>$19.99 <span>every 30 days</span></p>
            <p className={styles.terms}>3-day free trial on the 30-day plan. Annual plan available for $199.99.</p>
            <ul className={styles.planFeatures}>
              <li><Check size={16} /> Full slate, more markets and sportsbooks</li>
              <li><Check size={16} /> NBA projections, defense by position and player trends</li>
              <li><Check size={16} /> NFL Matchup Lab, player usage and The Public</li>
              <li><Check size={16} /> Saved pregame boards and historical results</li>
            </ul>
            <Link href="/pricing" className={styles.primaryButton}>See Ultimate plans <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section id="community" className={styles.section} aria-labelledby="community-title">
        <div className={styles.sectionIntro}>
          <h2 id="community-title">Share picks and follow the games</h2>
        </div>
        <div className={styles.communityGrid}>
          {community.map(({ title, copy, href }) => (
            <Link href={href} key={title} className={styles.communityLink}>
              <div><h3>{title}</h3><p>{copy}</p></div><ArrowUpRight size={17} />
            </Link>
          ))}
        </div>
        <div className={styles.books}>
          <span>Post picks from</span>
          {['fanduel', 'draftkings', 'betmgm', 'caesars'].map(book => <BookLogo key={book} vendor={book} size={18} />)}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="faq-title">
        <div className={styles.faqLayout}>
          <div className={styles.sectionIntro}>
            <h2 id="faq-title">Common questions</h2>
            <Link href="/faq" className={styles.textLink}>Read the full FAQ <ArrowRight size={16} /></Link>
          </div>
          <div className={styles.faqList}>
            {faqs.map(({ q, a }) => (
              <details key={q}><summary>{q}<ChevronDown size={16} /></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-title">
        <div>
          <h2 id="final-title">Start with a matchup</h2>
          <p>Open the board for either sport and see what moved before game time.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/preview/nba" className={styles.primaryButton}>NBA preview <ArrowRight size={16} /></Link>
          <Link href="/preview/nfl" className={styles.secondaryButton}>NFL preview <ArrowRight size={16} /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SlipSurge</span>
        <nav aria-label="Footer">
          <Link href="/about">About</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/support">Support</Link>
          <Link href="/responsible-gambling">Responsible Gambling</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/auth/register">Create an account</Link>
        </nav>
      </footer>
    </div>
  )
}
