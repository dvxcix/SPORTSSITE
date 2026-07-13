'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Zap, CheckCircle, ArrowLeft } from 'lucide-react'
import { sportLogoUrl } from '@/lib/sportLogos'

const SPORTS = ['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA', 'Tennis', 'Golf', 'Boxing', 'CFB', 'CBB']

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

  function toggleSport(s: string) {
    setSports(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) { router.push('/auth/login?next=/creators/apply'); return }
    if (!whyCreator.trim() || sports.length === 0) {
      setError('Please fill in all required fields and select at least one sport.')
      return
    }
    setSubmitting(true)
    setError('')

    const { error: err } = await supabase.from('creator_applications').insert({
      user_id: user.id,
      sports,
      why_creator: whyCreator.trim(),
      sample_picks: samplePicks.trim() || null,
      social_links: {
        twitter: twitter.trim() || null,
        instagram: instagram.trim() || null,
      },
      follower_count_at_apply: profile?.follower_count ?? 0,
    })

    if (err) {
      if (err.code === '23505') {
        setError('You already have an application submitted. Check back for updates.')
      } else {
        setError(err.message)
      }
      setSubmitting(false)
      return
    }

    setDone(true)
  }

  if (!user) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>Become a Creator</h1>
        <p style={{ color: 'var(--text-2)', marginBottom: 24 }}>Sign in first to apply for creator status.</p>
        <Link href="/auth/login?next=/creators/apply" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 10, fontWeight: 800, textDecoration: 'none' }}>Sign in</Link>
      </div>
    )
  }

  if (profile?.account_type === 'creator') {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <CheckCircle size={48} style={{ color: 'var(--accent)', margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>You&apos;re already a Creator!</h1>
        <p style={{ color: 'var(--text-2)', marginBottom: 24 }}>Head to your profile to set up your tiers and start earning.</p>
        <Link href={`/profile/${profile.username}`} style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 10, fontWeight: 800, textDecoration: 'none' }}>View Profile</Link>
      </div>
    )
  }

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', padding: '0 24px', textAlign: 'center' }}>
        <CheckCircle size={48} style={{ color: 'var(--accent)', margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>Application submitted!</h1>
        <p style={{ color: 'var(--text-2)', marginBottom: 8 }}>We&apos;ll review your application and get back to you within 24–48 hours.</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28 }}>In the meantime, keep posting picks — great track records help approvals.</p>
        <Link href="/feed" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--accent)', color: 'var(--accent-fg)', borderRadius: 10, fontWeight: 800, textDecoration: 'none' }}>Back to Feed</Link>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/creators" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-3)', fontSize: 13, textDecoration: 'none', marginBottom: 24 }}>
        <ArrowLeft size={14} /> Back to Creators
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={24} style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>Apply to be a Creator</h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 2 }}>Share picks, build a following, earn money</p>
        </div>
      </div>

      {/* Perks */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, margin: '24px 0', padding: '16px', background: 'var(--surface-2)', borderRadius: 12, border: '1px solid var(--border)' }}>
        {[['⚡', 'Verified Badge', 'Stand out from the crowd'], ['💰', 'Earn Money', 'Paid tiers & subscriptions'], ['📊', 'Analytics', 'Track your pick record']].map(([icon, title, desc]) => (
          <div key={title} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-1)' }}>{title}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{desc}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Sports */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, letterSpacing: '0.02em' }}>
            SPORTS YOU COVER <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SPORTS.map(s => {
              const logo = sportLogoUrl(s)
              return (
                <button key={s} type="button" onClick={() => toggleSport(s)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 700,
                  border: `1px solid ${sports.includes(s) ? 'var(--accent)' : 'var(--border-2)'}`,
                  background: sports.includes(s) ? 'var(--accent-dim)' : 'transparent',
                  color: sports.includes(s) ? 'var(--accent)' : 'var(--text-3)',
                  cursor: 'pointer', transition: 'all 130ms',
                }}>
                  {logo && <img src={logo} alt={s} style={{ width: 14, height: 14, objectFit: 'contain' }} />}
                  {s}
                </button>
              )
            })}
          </div>
        </div>

        {/* Why creator */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, letterSpacing: '0.02em' }}>
            WHY DO YOU WANT TO BE A CREATOR? <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <textarea
            value={whyCreator}
            onChange={e => setWhyCreator(e.target.value)}
            placeholder="Tell us about your betting experience, your track record, what makes you stand out…"
            rows={4}
            required
            className="ss-input"
            style={{ resize: 'vertical', minHeight: 100 }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{whyCreator.length}/500 characters</p>
        </div>

        {/* Sample picks */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, letterSpacing: '0.02em' }}>
            SAMPLE PICKS / TRACK RECORD <span style={{ color: 'var(--text-3)' }}>(optional)</span>
          </label>
          <textarea
            value={samplePicks}
            onChange={e => setSamplePicks(e.target.value)}
            placeholder="Share some recent picks with results, or a link to your record…"
            rows={3}
            className="ss-input"
            style={{ resize: 'vertical', minHeight: 80 }}
          />
        </div>

        {/* Social links */}
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8, letterSpacing: '0.02em' }}>
            SOCIAL LINKS <span style={{ color: 'var(--text-3)' }}>(optional)</span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              type="text"
              value={twitter}
              onChange={e => setTwitter(e.target.value)}
              placeholder="Twitter / X handle (@username)"
              className="ss-input"
            />
            <input
              type="text"
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              placeholder="Instagram handle (@username)"
              className="ss-input"
            />
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,77,106,0.08)', border: '1px solid rgba(255,77,106,0.2)', fontSize: 13, color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting || !whyCreator.trim() || sports.length === 0} style={{
          padding: '13px 24px', borderRadius: 10, fontSize: 14, fontWeight: 800,
          background: submitting || !whyCreator.trim() || sports.length === 0 ? 'var(--surface-3)' : 'var(--accent)',
          color: submitting || !whyCreator.trim() || sports.length === 0 ? 'var(--text-3)' : 'var(--accent-fg)',
          border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', transition: 'all 150ms',
        }}>
          {submitting ? 'Submitting…' : 'Submit Application'}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>
          Applications are reviewed within 24–48 hours. You&apos;ll be notified by email.
        </p>
      </form>
    </div>
  )
}
