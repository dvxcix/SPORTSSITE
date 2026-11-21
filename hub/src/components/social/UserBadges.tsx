'use client'

import { useUserBadges, type Badge } from '@/lib/badges'
import { Tooltip } from '@/components/ui/tooltip-card'
import { SafeImage } from '@/components/ui/SafeImage'

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
          <span className="ss-user-badge-shell" role="img" aria-label={`${b.name}. ${b.description}`} tabIndex={0} onPointerDown={event => event.currentTarget.focus()} style={{ minWidth: size + 6, height: size + 6, paddingInline: 3 }}>
            <SafeImage className="ss-user-badge-icon" src={b.icon_url} alt="" loading="eager" style={{ width: 'auto', height: size, maxWidth: size * 3.6 }} fallback={<span aria-hidden="true" className="ss-user-badge-fallback">◆</span>} />
          </span>
        </Tooltip>
      ))}
      {hidden.length > 0 && (
        <Tooltip content={<div className="ss-badge-overflow-list">{hidden.map(b => <BadgeTooltip key={b.id} badge={b} compact />)}</div>}>
          <span className="ss-user-badge-more" tabIndex={0} role="img" aria-label={`${hidden.length} more badges: ${hidden.map(b => b.name).join(', ')}`} onPointerDown={event => event.currentTarget.focus()}>+{hidden.length}</span>
        </Tooltip>
      )}
    </span>
  )
}

function BadgeTooltip({ badge, compact = false }: { badge: Badge; compact?: boolean }) {
  return (
    <div className={`ss-badge-tooltip${compact ? ' is-compact' : ''}`}>
      <span className="ss-badge-tooltip-art"><SafeImage src={badge.icon_url} alt="" fallback={<span aria-hidden="true">◆</span>} /></span>
      <span><strong>{badge.name}</strong><small>{badge.description}</small></span>
    </div>
  )
}
