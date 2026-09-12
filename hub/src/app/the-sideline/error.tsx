'use client'

export default function SidelineError({ reset }: { reset: () => void }) {
  return <div style={{ padding: 32, minHeight: '65vh', background: '#060a0f', color: '#f5f8fb' }}>
    <h1>The Sideline couldn’t load</h1>
    <p>The data request failed. Your saved tools and matrices are unchanged.</p>
    <button type="button" onClick={reset} style={{ padding: '12px 20px', background: '#a7ff3f', color: '#101510', borderRadius: 8 }}>Retry board</button>
  </div>
}
