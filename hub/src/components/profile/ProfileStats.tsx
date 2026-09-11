'use client'

import { motion } from 'motion/react'

const statVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  show: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.045, duration: 0.34 } }),
}

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 pt-4 sm:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          custom={i}
          initial="hidden"
          animate="show"
          variants={statVariants}
          whileHover={{ y: -2 }}
          className={`group relative overflow-hidden rounded-2xl border px-3.5 py-3.5 shadow-[inset_0_1px_rgba(255,255,255,.04)] transition-colors ${s.accent ? 'border-lime-400/20 bg-lime-400/[.055]' : 'border-white/[.075] bg-white/[.025] hover:border-white/[.13]'}`}
        >
          <span className={`absolute inset-x-3 top-0 h-px ${s.accent ? 'bg-gradient-to-r from-transparent via-lime-300/80 to-transparent' : 'bg-gradient-to-r from-transparent via-white/20 to-transparent'}`} />
          <p className={`text-xl font-black leading-none tracking-[-.04em] sm:text-2xl ${s.accent ? 'text-lime-300' : 'text-white'}`}>{s.value}</p>
          <p className="mt-2 text-[9px] font-black uppercase tracking-[.16em] text-zinc-500 transition-colors group-hover:text-zinc-400">{s.label}</p>
        </motion.div>
      ))}
    </div>
  )
}
