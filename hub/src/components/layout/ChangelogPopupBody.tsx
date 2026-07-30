'use client'

// The actual visual content of the "what's new" popup — pulled out into its
// own component so the admin manager's preview renders this EXACT markup,
// not a hand-copied approximation that can quietly drift from what a real
// member sees (the failure mode a plain inline mockup would have). Both the
// real ChangelogPopup (live, DB-backed dismissal) and the admin preview
// (fake data, no DB writes) render this same component inside the same
// Modal shell — what an admin previews is pixel-identical to what ships.
export function ChangelogPopupBody({ title, description, how_to_use, screenshot_urls, queuePosition, dismissLabel = "Got it — Don't show again", onDismiss }: {
  title: string
  description: string
  how_to_use: string | null
  screenshot_urls: string[]
  queuePosition?: string
  dismissLabel?: string
  onDismiss: () => void
}) {
  return (
    <>
      <div style={{ position: 'sticky', top: 0, padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 2 }}>
          What's New
        </div>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{title || 'Untitled entry'}</div>
      </div>

      {screenshot_urls.length > 0 && (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 8, padding: '12px 16px 0' }}>
          {screenshot_urls.map(url => (
            <img key={url} src={url} alt="" style={{ maxHeight: 220, borderRadius: 8, border: '1px solid var(--border)', flexShrink: 0 }} />
          ))}
        </div>
      )}

      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {description || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Nothing written yet.</span>}
        </p>
        {how_to_use && (
          <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>How to use it</div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{how_to_use}</p>
          </div>
        )}
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{queuePosition ?? ''}</span>
        <button
          onClick={onDismiss}
          style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer', border: '1px solid var(--accent)', borderRadius: 8, padding: '7px 16px', background: 'var(--accent-dim)', color: 'var(--accent)' }}
        >
          {dismissLabel}
        </button>
      </div>
    </>
  )
}
