import Link from 'next/link'

const FEATURES = [
  { emoji: '🏆', title: 'Follow top cappers', body: 'Track real, graded win/loss records — not screenshots.' },
  { emoji: '📊', title: 'Post picks & parlays', body: 'Same-book parlay building, live odds, and payout math built in.' },
  { emoji: '⚡', title: 'The Dugout', body: 'Live odds deltas, Statcast splits, and pitch-mix breakdowns for MLB.' },
  { emoji: '💬', title: 'Real community', body: 'Channels, groups, and a feed built around sports — not noise.' },
]

export function LandingPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
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
      <div style={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
        <div style={{
          position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
          width: 600, height: 600, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(180,255,77,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: '60px 24px 40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20 }}>
            The social hub for<br />sports & picks.
          </h1>
          <p style={{ fontSize: 17, color: 'var(--text-2)', lineHeight: 1.6, maxWidth: 480, margin: '0 auto 32px' }}>
            Drop picks, build parlays, follow cappers with real graded records, and watch live scores — all in one place.
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
        </div>

        {/* Features */}
        <div style={{ maxWidth: 900, margin: '20px auto 60px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{f.emoji}</div>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '20px 24px' }}>
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
