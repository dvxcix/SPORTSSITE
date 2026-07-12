'use client'

// Shared toggle switch — the admin panel previously had 4+ ad-hoc
// reimplementations (different sizes/colors, none using the app's real
// design tokens). This one uses the actual accent lime (--accent) and
// surface/border tokens from globals.css instead of hardcoded zinc/green.
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: React.ReactNode
  disabled?: boolean
}) {
  const track = (
    <span
      style={{
        position: 'relative', display: 'inline-block', width: 40, height: 22,
        borderRadius: 999, flexShrink: 0,
        background: checked ? 'var(--accent)' : 'var(--surface-3)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}`,
        boxShadow: checked ? '0 0 0 3px var(--accent-dim)' : 'none',
        transition: 'background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: checked ? 20 : 2,
          width: 16, height: 16, borderRadius: '50%',
          background: checked ? 'var(--accent-fg)' : 'var(--text-2)',
          transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1), background 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
        }}
      />
    </span>
  )

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {track}
      {label != null && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>}
    </button>
  )
}
