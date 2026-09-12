'use client'
import { SafeImage } from '@/components/ui/SafeImage'

// Same graceful-fallback pattern as BookLogo.tsx — team_logo_espn URLs are
// hotlinked from ESPN's CDN (already relied on elsewhere: team page, search
// results), so a broken/missing logo falls back to the plain abbreviation
// rather than a broken image icon.
export function NflTeamLogo({ abbr, logoUrl, size = 20 }: { abbr: string; logoUrl?: string | null; size?: number }) {
  const fallback = (
    <span
      className="inline-flex items-center justify-center flex-shrink-0 rounded bg-zinc-800 text-zinc-400 font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38, verticalAlign: 'middle' }}
    >
      {abbr}
    </span>
  )

  return <SafeImage src={logoUrl} alt={abbr} width={size} height={size} fallback={fallback} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, verticalAlign: 'middle' }} />
}
