'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { sportLogoUrl } from '@/lib/sportLogos'
import styles from './CreatorApply.module.css'

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

  const isCreator = profile?.account_type === 'creator'

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><Sparkles size={14} /> SlipSurge Creator Program</div>
          <h1>Turn your sports insight into a business.</h1>
          <p className={styles.lede}>Sell premium picks, build a member community, and create private channels around the content your audience values.</p>
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
            <span><CheckCircle2 size={16} /> Private group channels</span>
            <span><CheckCircle2 size={16} /> Direct member access</span>
          </div>
          <div className={styles.previewFooter}><span>Built on SlipSurge</span><span className={styles.liveDot}>Ready to launch</span></div>
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
