'use client'

import type { CSSProperties } from 'react'

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="ss-profile-stats" style={{ '--profile-stat-count': stats.length } as CSSProperties}>
      {stats.map(s => (
        <div
          key={s.label}
          className="ss-profile-stat"
        >
          <p className={`text-xl font-semibold leading-none tabular-nums sm:text-2xl ${s.accent ? 'text-[var(--accent)]' : 'text-[var(--text-1)]'}`}>{s.value}</p>
          <p className="mt-2 text-xs text-[var(--text-2)]">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
