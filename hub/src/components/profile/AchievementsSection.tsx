'use client'

import { CometCard } from '@/components/ui/comet-card'

export interface AchievementCard {
  id: string
  name: string
  description: string
  card_image_url: string
}

// Only rendered for badges an admin opted into having a card for (see
// badges.card_image_url) — most badges stay just the small name-badge icon,
// this is the "collectors card" upgrade for the ones worth showing off.
export function AchievementsSection({ achievements }: { achievements: AchievementCard[] }) {
  if (achievements.length === 0) return null

  return (
    <div className="px-4 py-5 border-t border-zinc-800">
      <h2 className="text-xs font-black text-zinc-400 uppercase tracking-wider mb-3">Achievements</h2>
      <div className="flex flex-wrap gap-4">
        {achievements.map(a => (
          <CometCard key={a.id}>
            <img
              src={a.card_image_url}
              alt={a.name}
              title={a.description}
              className="w-[220px] h-auto block"
            />
          </CometCard>
        ))}
      </div>
    </div>
  )
}
