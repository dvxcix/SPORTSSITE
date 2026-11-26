'use client'
import './framework.css'
import {ThemeProvider} from '@/components/theme/ThemeProvider'
import {ThemeToggle} from '@/components/theme/ThemeToggle'
import {SlipSurgeLogo} from '@/components/brand/SlipSurgeLogo'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body style={{ margin: 0, background: 'var(--bg)', color: 'var(--text-1)', fontFamily: 'Geist, Arial, sans-serif' }}>
       <ThemeProvider>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: 'min(100%, 520px)', border: '1px solid var(--border-2)', borderRadius: 16, padding: 28, background: 'var(--surface)', boxShadow: 'var(--shadow-overlay)' }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}><SlipSurgeLogo width={144}/><ThemeToggle full/></div>
            <h1 style={{ margin: '22px 0 0', fontSize: 28, letterSpacing: '-.03em' }}>We could not load the app</h1>
            <p style={{ margin: '12px 0 22px', color: 'var(--text-2)', lineHeight: 1.6 }}>Your account and data are safe. Retry the request to get back in.</p>
            <button type="button" onClick={reset} style={{ border: 0, borderRadius: 9, padding: '12px 18px', background: 'var(--accent-fill)', color: 'var(--accent-fg)', fontWeight: 600, cursor: 'pointer' }}>Try again</button>
          </section>
        </main>
       </ThemeProvider>
      </body>
    </html>
  )
}
