'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BellRing,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Layers3,
  LineChart,
  LockKeyhole,
  MessageSquareText,
  Radio,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { sportLogoUrl } from '@/lib/sportLogos'
import styles from './CreatorApply.module.css'
import { hasCreatorAccess } from '@/lib/creator'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Tennis', 'Golf', 'Boxing', 'CFB', 'CBB']

const CREATOR_TOOLS = [
  { icon: LockKeyhole, title: 'Sell premium picks', copy: 'Publish free previews and reserve premium posts or picks for paying members.' },
  { icon: Users, title: 'Build your community', copy: 'Create a branded group where members can follow your work and connect.' },
  { icon: MessageSquareText, title: 'Open private channels', copy: 'Give members dedicated discussion channels and real-time access to your content.' },
  { icon: CreditCard, title: 'Choose how you sell', copy: 'Offer recurring memberships or one-time access without building your own checkout.' },
  { icon: BarChart3, title: 'Grow your reputation', copy: 'Build a public creator profile around your content, community, and track record.' },
  { icon: CircleDollarSign, title: 'Get paid through Whop', copy: 'Use Whop-powered commerce, balance tools, and creator payout experiences.' },
]

const STEPS = [
  ['01', 'Apply', 'Tell us what you cover and show us how you create value for sports fans.'],
  ['02', 'Get approved', 'Our team reviews your application for quality, clarity, and community fit.'],
  ['03', 'Build your offer', 'Create your group, member access, premium content, and pricing.'],
  ['04', 'Launch', 'Invite your audience, publish consistently, and grow your creator business.'],
]

const MEMBERSHIP_LAYERS = [
  { icon: Target, title: 'Your picks and analysis', copy: 'Free previews, premium cards, write-ups, recaps, and tracked content.' },
  { icon: LineChart, title: 'SlipSurge research tools', copy: 'Bundle eligible analytics, market movement, and research access into your tiers.' },
  { icon: BellRing, title: 'Real-time member alerts', copy: 'Keep members close to new posts, lineup news, live events, and community activity.' },
  { icon: MessageSquareText, title: 'Private community access', copy: 'Create member-only groups and channels around your creator brand.' },
]

const PLATFORM_ADVANTAGES = [
  ['Research built in', 'Your members can move from your content into the same live data, odds, and analysis environment.'],
  ['More value per tier', 'Combine content, tools, alerts, and community access instead of selling a feed by itself.'],
  ['One connected identity', 'Profiles, memberships, posts, groups, channels, and access live in one product.'],
  ['Room to expand', 'Launch multiple tiers, one-time offers, premium experiences, and new sports as your audience grows.'],
]

export default function CreatorApplyPage() {
  const { user, profile } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [sports, setSports] = useState<string[]>([])
  const [whyCreator, setWhyCreator] = useState('')
  const [samplePicks, setSamplePicks] = useState('')
  const [twitter, setTwitter] = useState('')
  const [instagram, setInstagram] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  function toggleSport(sport: string) {
    setSports((current) => current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport])
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!user) {
      router.push('/auth/login?next=/creators/apply')
      return
    }
    if (!whyCreator.trim() || sports.length === 0) {
      setError('Select at least one sport and tell us why you want to create on SlipSurge.')
      return
    }

    setSubmitting(true)
    setError('')
    const { error: submitError } = await supabase.from('creator_applications').insert({
      user_id: user.id,
      sports,
      why_creator: whyCreator.trim(),
      sample_picks: samplePicks.trim() || null,
      social_links: { twitter: twitter.trim() || null, instagram: instagram.trim() || null },
      follower_count_at_apply: profile?.follower_count ?? 0,
    })

    if (submitError) {
      setError(submitError.code === '23505' ? 'You already have an application under review.' : submitError.message)
      setSubmitting(false)
      return
    }

    setDone(true)
    setSubmitting(false)
  }

  const isCreator = hasCreatorAccess(profile?.account_type)

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> SlipSurge Creator Program</div>
          <h1>Give your audience more than a picks feed.</h1>
          <p className={styles.lede}>Bring your brand, content, and community into a membership powered by SlipSurge research, analytics, live data, and creator tools.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#creator-application">Start your application <ArrowRight size={17} /></a>
            <a className={styles.secondaryButton} href="#how-it-works">See how it works</a>
          </div>
          <div className={styles.heroFacts}>
            <span><Check size={14} /> Free to apply</span>
            <span><Check size={14} /> Reviewed by our team</span>
            <span><Check size={14} /> Commerce powered by Whop</span>
          </div>
        </div>

        <div className={styles.previewShell} aria-label="Example SlipSurge creator membership">
          <div className={styles.previewTop}><span>Creator storefront</span><BadgeCheck size={17} /></div>
          <div className={styles.previewIdentity}>
            <div className={styles.previewAvatar}>SS</div>
            <div><strong>Your Creator Brand</strong><span>Premium sports community</span></div>
          </div>
          <div className={styles.previewOffer}>
            <span>All-access membership</span>
            <strong>Your price</strong>
            <small>Recurring or one-time access</small>
          </div>
          <div className={styles.previewList}>
            <span><CheckCircle2 size={16} /> Premium posts and picks</span>
            <span><CheckCircle2 size={16} /> SlipSurge analytics access</span>
            <span><CheckCircle2 size={16} /> Private groups and alerts</span>
          </div>
          <div className={styles.previewFooter}><span>Built on SlipSurge</span><span className={styles.liveDot}>Ready to launch</span></div>
        </div>
      </section>

      <section className={styles.valueSection}>
        <div className={styles.valueIntro}>
          <div>
            <span className={styles.kicker}>A better membership product</span>
            <h2>Your expertise is the brand. SlipSurge is the platform behind it.</h2>
          </div>
          <p>Stop stitching together a paywall, a chat room, screenshots, and disconnected research links. Build one destination your members can use every day.</p>
        </div>
        <div className={styles.valueGrid}>
          <article className={styles.valueMainCard}>
            <div className={styles.valueCardTop}><div className={styles.toolIcon}><Layers3 size={20} /></div><span>Membership builder</span></div>
            <h3>Package the full SlipSurge experience into your offer.</h3>
            <p>Your tiers can combine your premium content with eligible platform access, research experiences, groups, channels, and alerts.</p>
            <div className={styles.bundleStack}>
              {MEMBERSHIP_LAYERS.map(({ icon: Icon, title }) => <div key={title}><Icon size={16} /><span>{title}</span><Check size={14} /></div>)}
            </div>
          </article>
          <article className={styles.valueSideCard}>
            <div className={styles.valueCardTop}><div className={styles.toolIcon}><Activity size={20} /></div><span>Research access</span></div>
            <div className={styles.miniTerminal}>
              <div><span>ODDS MOVEMENT</span><Radio size={14} /></div>
              <div className={styles.chartLines} aria-hidden="true"><i /><i /><i /></div>
              <footer><span>Live markets</span><strong>Inside their membership</strong></footer>
            </div>
          </article>
          <article className={styles.valueSideCard}>
            <div className={styles.valueCardTop}><div className={styles.toolIcon}><Rocket size={20} /></div><span>Bring your audience</span></div>
            <h3>Move forward without rebuilding your business from zero.</h3>
            <p>Keep your creator identity, set your offers, invite your existing audience, and give them a stronger reason to stay.</p>
            <a href="#creator-application">Apply to move your brand <ArrowRight size={15} /></a>
          </article>
        </div>
      </section>

      <section className={styles.membershipSection}>
        <div className={styles.sectionHeading}>
          <span>What members can receive</span>
          <h2>Build tiers people can feel.</h2>
          <p>Every membership can be a complete experience, not a recurring charge for access to a single chat.</p>
        </div>
        <div className={styles.membershipGrid}>
          {MEMBERSHIP_LAYERS.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}><span className={styles.layerNumber}>0{index + 1}</span><Icon size={22} /><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.advantageSection}>
        <div className={styles.advantageLead}>
          <span className={styles.kicker}>Built for the next stage</span>
          <h2>Your current audience is the start, not the ceiling.</h2>
          <p>SlipSurge connects creator commerce to a sports platform members already have a reason to open before, during, and after games.</p>
          <a className={styles.primaryButton} href="#creator-application">Build on SlipSurge <ArrowRight size={17} /></a>
        </div>
        <div className={styles.advantageList}>
          {PLATFORM_ADVANTAGES.map(([title, copy]) => <div key={title}><CheckCircle2 size={20} /><span><strong>{title}</strong><small>{copy}</small></span></div>)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>Everything in one place</span>
          <h2>Create content. Build access. Grow your community.</h2>
          <p>SlipSurge gives approved creators the tools to turn trusted sports content into a real member experience.</p>
        </div>
        <div className={styles.toolGrid}>
          {CREATOR_TOOLS.map(({ icon: Icon, title, copy }) => (
            <article className={styles.toolCard} key={title}>
              <div className={styles.toolIcon}><Icon size={20} /></div>
              <h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.whopSection}>
        <div className={styles.whopMark} aria-label="Whop">
          <Image src="/brands/whop-logo.svg" alt="Whop" width={148} height={52} />
        </div>
        <div className={styles.whopCopy}>
          <span>Payments and payouts powered by Whop</span>
          <h2>Focus on your members. Whop handles the commerce layer.</h2>
          <p>Approved creators connect through Whop to support secure checkout, recurring access, account onboarding, balances, and payouts.</p>
        </div>
        <div className={styles.whopBenefits}>
          <span><ShieldCheck size={18} /> Connected creator onboarding</span>
          <span><CreditCard size={18} /> Membership checkout</span>
          <span><CircleDollarSign size={18} /> Balance and payout tools</span>
        </div>
      </section>

      <section className={styles.section} id="how-it-works">
        <div className={styles.sectionHeading}>
          <span>How it works</span><h2>From application to launch.</h2>
          <p>A focused approval process keeps the creator marketplace useful for members and creators.</p>
        </div>
        <div className={styles.steps}>
          {STEPS.map(([number, title, copy]) => (
            <article className={styles.step} key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={styles.applicationSection} id="creator-application">
        <aside className={styles.reviewPanel}>
          <span className={styles.kicker}>Before you apply</span>
          <h2>What we look for.</h2>
          <p>We approve creators who can add a clear, responsible point of view to the SlipSurge community.</p>
          <ul>
            <li><CheckCircle2 size={18} /><span><strong>A clear niche</strong>Tell us which sports or markets you cover.</span></li>
            <li><CheckCircle2 size={18} /><span><strong>Useful content</strong>Show how your work helps members make informed decisions.</span></li>
            <li><CheckCircle2 size={18} /><span><strong>A credible record</strong>Share public examples, past picks, or an established audience.</span></li>
            <li><CheckCircle2 size={18} /><span><strong>Community standards</strong>Creators must communicate responsibly and never guarantee outcomes.</span></li>
          </ul>
          <div className={styles.disclosure}>Approval and earnings are not guaranteed. Creator content must follow SlipSurge policies and applicable law.</div>
        </aside>

        <div className={styles.formCard}>
          {isCreator ? (
            <div className={styles.formState}>
              <div className={styles.stateIcon}><BadgeCheck size={30} /></div>
              <span>Creator access active</span><h2>You are already approved.</h2>
              <p>Open Creator Studio to configure your group, channels, products, and member access.</p>
              <Link className={styles.primaryButton} href="/creators/studio">Open Creator Studio <ArrowRight size={17} /></Link>
            </div>
          ) : done ? (
            <div className={styles.formState}>
              <div className={styles.stateIcon}><CheckCircle2 size={30} /></div>
              <span>Application received</span><h2>We have it from here.</h2>
              <p>Our team will review your application. You will receive an update when a decision is ready.</p>
              <Link className={styles.secondaryButton} href="/feed">Return to the feed</Link>
            </div>
          ) : !user ? (
            <div className={styles.formState}>
              <div className={styles.stateIcon}><Sparkles size={30} /></div>
              <span>Ready to apply?</span><h2>Sign in to get started.</h2>
              <p>Your SlipSurge account connects your application to your profile, content, and creator access.</p>
              <Link className={styles.primaryButton} href="/auth/login?next=/creators/apply">Sign in and apply <ArrowRight size={17} /></Link>
              <small>Creating a SlipSurge account is free.</small>
            </div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formHeading}><span>Creator application</span><h2>Tell us about your work.</h2><p>Required fields are marked with an asterisk.</p></div>
              <fieldset>
                <legend>Sports you cover <em>*</em></legend>
                <div className={styles.sportGrid}>
                  {SPORTS.map((sport) => {
                    const selected = sports.includes(sport)
                    const logo = sportLogoUrl(sport)
                    return <button className={selected ? styles.sportSelected : styles.sport} aria-pressed={selected} key={sport} type="button" onClick={() => toggleSport(sport)}>{logo && <img src={logo} alt="" width={18} height={18} /> /* eslint-disable-line @next/next/no-img-element */}<span>{sport}</span>{selected && <Check size={14} />}</button>
                  })}
                </div>
              </fieldset>
              <label>Why do you want to create on SlipSurge? <em>*</em>
                <textarea value={whyCreator} onChange={(event) => setWhyCreator(event.target.value)} maxLength={500} rows={5} required placeholder="Tell us about your experience, audience, approach, and what you want to build." />
                <small>{whyCreator.length}/500</small>
              </label>
              <label>Sample picks or track record <span>Optional</span>
                <textarea value={samplePicks} onChange={(event) => setSamplePicks(event.target.value)} maxLength={1000} rows={4} placeholder="Share recent examples, results, or a link to your public work." />
              </label>
              <div className={styles.socialFields}>
                <label>X handle <span>Optional</span><input value={twitter} onChange={(event) => setTwitter(event.target.value)} placeholder="@username" /></label>
                <label>Instagram <span>Optional</span><input value={instagram} onChange={(event) => setInstagram(event.target.value)} placeholder="@username" /></label>
              </div>
              {error && <div className={styles.error} role="alert">{error}</div>}
              <button className={styles.submitButton} type="submit" disabled={submitting || !whyCreator.trim() || sports.length === 0}>{submitting ? 'Submitting application...' : 'Submit creator application'}<ArrowRight size={17} /></button>
              <p className={styles.formNote}>By applying, you agree to follow SlipSurge creator and community policies.</p>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
