'use client'

// Shared toggle switch — the admin panel previously had 4+ ad-hoc
// reimplementations (different sizes/colors, none using the app's real
// design tokens). This one uses the actual accent lime (--accent) and
// surface/border tokens from globals.css instead of hardcoded zinc/green.
export function Switch({ checked, onChange, label, disabled, ariaLabel, size = 'md' }: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: React.ReactNode
  disabled?: boolean
  ariaLabel?: string
  size?: 'sm' | 'md'
}) {
  const dimensions = size === 'sm'
    ? { width: 36, height: 20, thumb: 14, travel: 16 }
    : { width: 42, height: 24, thumb: 18, travel: 18 }

  const track = (
    <span
      aria-hidden="true"
      style={{
        position: 'relative', display: 'inline-block',
        width: dimensions.width, minWidth: dimensions.width, height: dimensions.height,
        borderRadius: 999, flex: `0 0 ${dimensions.width}px`, overflow: 'hidden',
        boxSizing: 'border-box',
        background: checked ? 'var(--accent)' : 'var(--surface-3)',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}`,
        boxShadow: checked ? '0 0 0 3px var(--accent-dim)' : 'none',
        transition: 'background 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
      }}
    >
      <span
        style={{
          position: 'absolute', top: 2, left: 2,
          width: dimensions.thumb, height: dimensions.thumb, borderRadius: '50%',
          background: '#fff',
          transform: `translateX(${checked ? dimensions.travel : 0}px)`,
          transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1), background 0.2s ease',
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
      aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'none', border: 'none', padding: 0, flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {track}
      {label != null && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{label}</span>}
    </button>
  )
}
