'use client'

import { useUserBadges, type Badge } from '@/lib/badges'
import { Tooltip } from '@/components/ui/tooltip-card'

// Renders inline next to a display name wherever one shows up (post
// author, comment author, profile header, leaderboard row, search
// result) — hover shows the badge's name + what it's for, same Aceternity
// Tooltip already used site-wide for everything else.
export function UserBadges({ userId, size = 14, maxVisible = 4, badges: suppliedBadges }: {
  userId: string | null | undefined
  size?: number
  maxVisible?: number
  badges?: Badge[]
}) {
  const fetchedBadges = useUserBadges(suppliedBadges ? null : userId)
  const badges = suppliedBadges ?? fetchedBadges
  if (!userId || badges.length === 0) return null

  const visible = badges.slice(0, maxVisible)
  const hidden = badges.slice(maxVisible)

  return (
    <span className="ss-user-badges">
      {visible.map(b => (
        <Tooltip key={b.id} content={<BadgeTooltip badge={b} />}>
          <span className="ss-user-badge-shell" style={{ width: size + 6, height: size + 6 }}>
            <img className="ss-user-badge-icon" src={b.icon_url} alt={b.name} style={{ width: size, height: size }} />
          </span>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip content={<div className="ss-badge-overflow-list">{hidden.map(b => <BadgeTooltip key={b.id} badge={b} compact />)}</div>}>
          <span className="ss-user-badge-more">+{hidden.length}</span>
        </Tooltip>
      )}
    </span>
  )
}

function BadgeTooltip({ badge, compact = false }: { badge: Badge; compact?: boolean }) {
  return (
    <div className={`ss-badge-tooltip${compact ? ' is-compact' : ''}`}>
      <span className="ss-badge-tooltip-art"><img src={badge.icon_url} alt="" /></span>
      <span><strong>{badge.name}</strong><small>{badge.description}</small></span>
    </div>
  )
}
