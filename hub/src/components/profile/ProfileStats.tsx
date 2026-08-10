'use client'

import { motion } from 'motion/react'

const statVariants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }),
}

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4">
      {stats.map((s, i) => (
        <motion.div key={s.label} custom={i} initial="hidden" animate="show" variants={statVariants} className="rounded-xl border border-white/[.07] bg-black/25 px-3 py-3">
          <p className={`font-black text-xl leading-none ${s.accent ? 'text-lime-300' : 'text-white'}`}>{s.value}</p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mt-1.5">{s.label}</p>
        </motion.div>
      ))}
    </div>
  )
}
