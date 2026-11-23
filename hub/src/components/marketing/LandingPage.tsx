import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { BookLogo } from '@/components/BookLogo'
import { sportTeamBackground, sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { PREVIEW_CONFIG } from '@/lib/publicResearchPreview'
import { ResearchShowcase } from './ResearchShowcase'
import { PublicSiteHeader } from './PublicSiteHeader'
import { PublicCommunities, PublicCommunitiesLoading } from './PublicCommunities'
import { DiscoveryLink } from './DiscoveryLink'
import styles from './LandingPage.module.css'

const portraits = [
  { sport: 'nfl', team: 'TB', name: 'Cade Otton', portrait: 'https://static.www.nfl.com/image/upload/t_player_profile_landscape/f_auto/league/yanr6h9aplae3jyzimf7', value: '25', unit: 'receiving yards' },
  { sport: 'nba', team: 'LAL', name: 'Austin Reaves', portrait: 'https://cdn.nba.com/headshots/nba/latest/1040x760/1630559.png', value: '43', unit: 'points' },
] as const

const community = [
  { title: 'Read the Feed', copy: 'See the public picks, research and conversations people are sharing.', href: '/feed', destination: 'feed' },
  { title: 'Meet the creators', copy: 'Browse their communities and memberships before choosing who to follow.', href: '/creators', destination: 'creators' },
  { title: 'Follow the games', copy: 'Open scores and box scores alongside your research.', href: '/sports', destination: 'scores' },
  { title: 'Check public records', copy: 'Browse the leaderboard by sport, record and streak.', href: '/leaderboard', destination: 'leaderboard' },
]

const faqs = [
  { q: 'Can I try the boards without an account?', a: 'Yes. The NBA and NFL previews each have a featured matchup, one market and FanDuel prices. You can change the player and line and compare each saved price with its opening.' },
  { q: 'What comes with Ultimate?', a: 'Both research workspaces come with one membership. You get the full available odds boards, more markets and sportsbooks, saved pregame history, NBA projections and defense by position, and NFL matchup research and public pick counts where available.' },
  { q: 'Do I need an account to browse communities?', a: 'You can browse public posts, creator pages and community listings first. Create a free account when you want to follow people, post or join a community. Paid communities require their own active membership.' },
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
      <PublicSiteHeader />
      <main id="main-content" tabIndex={-1}>
      <section id="research" className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroCopy}>
          <h1 id="landing-title">Research the game.<br />Share your read.</h1>
          <p className={styles.lede}>Your NBA and NFL research, picks and communities. Take a look around before making an account.</p>
          <div className={styles.actions}>
            <DiscoveryLink href="/preview/nba" destination="nba_preview" className={styles.primaryButton}>Open NBA board</DiscoveryLink>
            <DiscoveryLink href="/preview/nfl" destination="nfl_preview" className={styles.secondaryButton}>Open NFL board</DiscoveryLink>
          </div>
          <p className={styles.note}>Free previews. No account needed.</p>
        </div>
        <div className={styles.heroWorkbench}><ResearchShowcase /></div>
      </section>

      <section className={`${styles.section} ${styles.researchStory}`} aria-labelledby="research-title">
        <PlayerCards />
        <div>
          <div className={styles.sectionIntro}>
            <h2 id="research-title">Two sports.<br />One research desk.</h2>
            <p>Move from a price to a player, a matchup and a conversation.</p>
          </div>
          <div className={styles.workspaceLinks}>
            <DiscoveryLink href="/preview/nba" destination="nba_preview"><span><strong>The Court</strong><span>NBA player trends, game logs and odds boards.</span></span><span>NBA <ArrowRight size={16} aria-hidden="true" /></span></DiscoveryLink>
            <DiscoveryLink href="/preview/nfl" destination="nfl_preview"><span><strong>The Sideline</strong><span>NFL usage, matchups and odds boards.</span></span><span>NFL <ArrowRight size={16} aria-hidden="true" /></span></DiscoveryLink>
          </div>
          <p className={styles.note}>The examples above are dated archives. Open a preview to see its featured matchup and available prices.</p>
        </div>
      </section>

      <section id="community" className={styles.section} aria-labelledby="community-title">
        <div className={styles.communityHeading}>
          <div className={styles.sectionIntro}>
            <h2 id="community-title">Find your people.</h2>
            <p>Read public posts, browse creators and get a feel for a community before joining.</p>
          </div>
          <DiscoveryLink href="/groups" destination="communities" className={styles.secondaryButton}>Browse all communities</DiscoveryLink>
        </div>
        <Suspense fallback={<PublicCommunitiesLoading />}><PublicCommunities /></Suspense>
        <div className={styles.communityGrid}>
          {community.map(({ title, copy, href, destination }) => (
            <DiscoveryLink href={href} destination={destination} key={href} className={styles.communityLink}>
              <div><h3>{title}</h3><p>{copy}</p></div><ArrowRight size={17} aria-hidden="true" />
            </DiscoveryLink>
          ))}
        </div>
        <div className={styles.books}>
          <span>Post picks from</span>
          {['fanduel', 'draftkings', 'betmgm', 'caesars'].map(book => <BookLogo key={book} vendor={book} size={18} />)}
        </div>
      </section>

      <section id="membership" className={styles.section} aria-labelledby="membership-title">
        <div className={styles.sectionIntro}>
          <h2 id="membership-title">One membership for both sports</h2>
          <p>Browse first. Create a free account to take part, or choose Ultimate for both research workspaces.</p>
        </div>
        <div className={styles.plans}>
          <div className={styles.plan}>
            <h3>Free</h3>
            <p className={styles.price}>$0</p>
            <ul className={styles.planFeatures}>
              <li><Check size={16} /> One featured game per preview</li>
              <li><Check size={16} /> NBA points and NFL receiving yards</li>
              <li><Check size={16} /> Browse public posts and communities</li>
              <li><Check size={16} /> Create an account to post, follow and save</li>
            </ul>
            <DiscoveryLink href="/auth/register" destination="registration" className={styles.secondaryButton}>Create a free account</DiscoveryLink>
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
            <DiscoveryLink href="/pricing" destination="membership" className={styles.primaryButton}>See Ultimate plans</DiscoveryLink>
          </div>
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
          <h2 id="final-title">Take a look inside.</h2>
          <p>Start with a board or meet the community. Your account can come later.</p>
        </div>
        <div className={styles.actions}>
          <DiscoveryLink href="/preview/nba" destination="nba_preview" className={styles.primaryButton}>Open NBA research</DiscoveryLink>
          <DiscoveryLink href="/groups" destination="communities" className={styles.secondaryButton}>Browse communities</DiscoveryLink>
        </div>
      </section>

      </main>
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
