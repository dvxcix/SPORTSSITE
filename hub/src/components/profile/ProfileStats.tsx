'use client'

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 pt-4 sm:grid-cols-4">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-xl border border-white/[.075] bg-white/[.025] p-4"
        >
          <p className={`text-xl font-semibold leading-none tabular-nums sm:text-2xl ${s.accent ? 'text-lime-300' : 'text-white'}`}>{s.value}</p>
          <p className="mt-2 text-xs text-zinc-400">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
