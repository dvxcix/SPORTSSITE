'use client'

import { useUserBadges } from '@/lib/badges'
import { Tooltip } from '@/components/ui/tooltip-card'

// Renders inline next to a display name wherever one shows up (post
// author, comment author, profile header, leaderboard row, search
// result) — hover shows the badge's name + what it's for, same Aceternity
// Tooltip already used site-wide for everything else.
export function UserBadges({ userId, size = 14 }: { userId: string | null | undefined; size?: number }) {
  const badges = useUserBadges(userId)
  if (!userId || badges.length === 0) return null

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {badges.map(b => (
        <Tooltip key={b.id} content={<span><strong>{b.name}</strong> — {b.description}</span>}>
          <img
            src={b.icon_url}
            alt={b.name}
            style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle', cursor: 'help' }}
          />
        </Tooltip>
      ))}
    </span>
  )
}
