'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { mlbHeadshot } from '@/lib/mlb-api'
import { getTeamLogoUrl } from '@/lib/mlbTeamColors'
import { PlayerAvatar } from '@/components/sports/PlayerAvatar'

export type PickerOption = { id: number; name: string; teamAbbr?: string | null; count: number }

// Headshot + team-logo searchable dropdown — the "vs pitcher" / "vs batter"
// selector for the matchup explorer cards. A plain <select> can't render
// avatars per option, so this is a custom button + popover list instead,
// reusing the same PlayerAvatar every player link on this page already uses.
export function PlayerPicker({ options, value, onChange, placeholder }: {
  options: PickerOption[]
  value: number | 'all'
  onChange: (v: number | 'all') => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const filtered = useMemo(
    () => options.filter(o => o.name.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  )
  const selected = value === 'all' ? null : options.find(o => o.id === value)

  function pick(v: number | 'all') {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 220, maxWidth: 280 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface-2)', color: 'var(--text-1)',
        }}
      >
        {selected ? (
          <>
            <PlayerAvatar headshot={mlbHeadshot(selected.id)} teamLogo={getTeamLogoUrl(selected.teamAbbr)} teamAbbr={selected.teamAbbr} name={selected.name} size={22} />
            <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name}</span>
          </>
        ) : (
          <span style={{ flex: 1, textAlign: 'left', color: 'var(--text-3)' }}>{placeholder}</span>
        )}
        <span style={{ color: 'var(--text-3)', fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, width: 300, maxHeight: 320, overflowY: 'auto',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, zIndex: 50,
            boxShadow: '0 12px 28px rgba(0,0,0,0.5)',
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 12,
              background: 'var(--bg)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-1)', outline: 'none',
            }}
          />
          <div
            onClick={() => pick('all')}
            style={{
              padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              color: value === 'all' ? 'var(--accent)' : 'var(--text-1)', background: value === 'all' ? 'var(--accent-dim)' : undefined,
            }}
          >
            {placeholder}
          </div>
          {filtered.map(o => (
            <div
              key={o.id}
              onClick={() => pick(o.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer',
                background: value === o.id ? 'var(--accent-dim)' : undefined,
              }}
            >
              <PlayerAvatar headshot={mlbHeadshot(o.id)} teamLogo={getTeamLogoUrl(o.teamAbbr)} teamAbbr={o.teamAbbr} name={o.name} size={24} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{o.count}</span>
            </div>
          ))}
          {filtered.length === 0 && <div style={{ padding: '10px', fontSize: 12, color: 'var(--text-3)' }}>No matches.</div>}
        </div>
      )}
    </div>
  )
}
