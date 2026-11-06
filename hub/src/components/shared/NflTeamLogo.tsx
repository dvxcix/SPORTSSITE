'use client'
import { SafeImage } from '@/components/ui/SafeImage'
import { sportTeamLogoUrl } from '@/lib/sportTeamArtwork'
import { sportLogoUrl } from '@/lib/sportLogos'

// Resolve from the NFL directory even when older payloads omit their logo.
export function NflTeamLogo({ abbr, logoUrl, size = 20 }: { abbr: string; logoUrl?: string | null; size?: number }) {
  const fallback = <SafeImage src={sportLogoUrl('NFL')} alt={`NFL ${abbr}`} width={size} height={size} style={{ objectFit: 'contain' }} />

  return <SafeImage src={sportTeamLogoUrl('nfl', abbr) ?? logoUrl} alt={abbr} width={size} height={size} fallback={fallback} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, verticalAlign: 'middle' }} />
}
