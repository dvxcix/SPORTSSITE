'use client'

import { motion } from 'motion/react'

const statVariants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }),
}

export function ProfileStats({ stats }: { stats: { value: string; label: string; accent?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2">
      {stats.map((s, i) => (
        <motion.div key={s.label} custom={i} initial="hidden" animate="show" variants={statVariants}>
          <p className={`font-black text-lg leading-none ${s.accent ? 'text-[var(--accent)]' : 'text-white'}`}>{s.value}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{s.label}</p>
        </motion.div>
      ))}
    </div>
  )
}
