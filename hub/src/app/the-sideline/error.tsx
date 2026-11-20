'use client'

export default function SidelineError({ reset }: { reset: () => void }) {
  return <div style={{ padding: 32, minHeight: '65vh', background: 'var(--surface)', color: 'var(--text-1)' }}>
    <h1>The Sideline couldn’t load</h1>
    <p>The data request failed. Your saved tools and matrices are unchanged.</p>
    <button type="button" onClick={reset} style={{ padding: '12px 20px', background: 'var(--accent-fill)', color: 'var(--text-1)', borderRadius: 8 }}>Retry board</button>
  </div>
}
