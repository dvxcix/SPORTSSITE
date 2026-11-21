import type { CSSProperties } from 'react'
import { SafeImage } from '@/components/ui/SafeImage'
import { AvatarDecoration } from './AvatarDecoration'
import { avatarDecoration, isAvatarStyle, type MemberRingStyle } from '@/lib/avatarStyles'
export type { MemberRingStyle } from '@/lib/avatarStyles'

type MemberTone = 'default' | 'creator' | 'advanced' | 'ultimate'

function hueFor(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash) % 360
}

export function MemberAvatar({
  src,
  name,
  size = 44,
  tone = 'default',
  ringStyle = 'surge',
  ringColor,
  online = false,
  className = '',
  still = false,
}: {
  src?: string | null
  name: string
  size?: number
  tone?: MemberTone
  ringStyle?: MemberRingStyle | null
  ringColor?: string | null
  online?: boolean
  className?: string
  still?: boolean
}) {
  const safeStyle = isAvatarStyle(ringStyle) ? ringStyle : 'surge'
  const decoration = avatarDecoration(safeStyle)
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'
  const style = {
    '--member-size': `${size}px`,
    '--member-hue': hueFor(name),
    '--member-custom-ring': ringColor || undefined,
    width: size,
    height: size,
    minWidth: size,
    maxWidth: size,
    minHeight: size,
    maxHeight: size,
    flexBasis: size,
    flexGrow: 0,
    flexShrink: 0,
  } as CSSProperties

  return (
    <span className={`ss-member-avatar is-${tone} ring-${decoration ? 'none' : safeStyle}${decoration ? ' has-decoration' : ''}${still ? ' is-still' : ''} ${className}`} style={style} role="img" aria-label={`${name} avatar`}>
      <span className="ss-member-avatar-media">
        <span className="ss-member-avatar-initials" aria-hidden="true">{initials}</span>
        <SafeImage src={src} alt="" width={size} height={size} loading={size >= 72 ? 'eager' : 'lazy'} fallback={null} />
      </span>
      {decoration && <AvatarDecoration key={decoration.id} item={decoration} still={still} />}
      {online && <span className="ss-member-presence" />}
    </span>
  )
}
