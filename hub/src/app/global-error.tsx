'use client'

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#050706', color: '#f7f9f4', fontFamily: 'Arial, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: 'min(100%, 520px)', border: '1px solid rgba(180,255,77,.24)', borderRadius: 24, padding: 28, background: 'linear-gradient(145deg, rgba(180,255,77,.08), rgba(10,14,12,.96) 45%)', boxShadow: '0 24px 80px rgba(0,0,0,.45)' }}>
            <div aria-hidden="true" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#b4ff4d', color: '#091006', fontSize: 24, fontWeight: 900 }}>S</div>
            <p style={{ margin: '22px 0 6px', color: '#b4ff4d', fontSize: 12, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>SlipSurge</p>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: '-.03em' }}>We could not load the app</h1>
            <p style={{ margin: '12px 0 22px', color: '#a8b0aa', lineHeight: 1.6 }}>Your account and data are safe. Retry the request to get back in.</p>
            <button type="button" onClick={reset} style={{ border: 0, borderRadius: 12, padding: '12px 18px', background: '#b4ff4d', color: '#091006', fontWeight: 900, cursor: 'pointer' }}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  )
}
