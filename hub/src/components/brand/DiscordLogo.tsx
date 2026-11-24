import type { CSSProperties } from 'react'

export const DISCORD_BRAND = { accent: '#5865f2', deep: '#353fc4' }
export const DISCORD_BRAND_STYLE = { '--discord-brand': DISCORD_BRAND.accent, '--discord-deep': DISCORD_BRAND.deep, '--provider-accent': DISCORD_BRAND.accent, '--provider-deep': DISCORD_BRAND.deep } as CSSProperties

/** The same Discord mark used in member Connected Accounts. */
export function DiscordLogo({ size = 32 }: { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M20.3 4.4a19.7 19.7 0 0 0-4.9-1.5l-.1.1c-.2.4-.4.8-.6 1.2a18.4 18.4 0 0 0-5.5 0c-.2-.4-.4-.9-.6-1.2a.1.1 0 0 0-.1-.1 19.8 19.8 0 0 0-4.9 1.5C.5 9-.3 13.6.1 18.1l.1.1a19.8 19.8 0 0 0 6 3l.1-.1c.5-.6.9-1.3 1.2-2a13.3 13.3 0 0 1-1.9-.9v-.1l.4-.3h.1c3.9 1.8 8.2 1.8 12.1 0h.1l.4.3v.1c-.6.3-1.2.6-1.9.9.4.7.8 1.4 1.2 2h.1a19.8 19.8 0 0 0 6-3l.1-.1c.5-5.2-.8-9.7-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z" />
  </svg>
}
