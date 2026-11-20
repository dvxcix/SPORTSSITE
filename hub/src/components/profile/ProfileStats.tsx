'use client'

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 pt-4 sm:grid-cols-4">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-xl border border-[rgba(var(--line-rgb),0.075)] bg-[rgba(var(--contrast-rgb),0.025)] p-4"
        >
          <p className={`text-xl font-semibold leading-none tabular-nums sm:text-2xl ${s.accent ? 'text-[var(--accent)]' : 'text-[var(--text-1)]'}`}>{s.value}</p>
          <p className="mt-2 text-xs text-[var(--text-2)]">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
