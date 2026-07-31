import Link from 'next/link'
import { Lock } from 'lucide-react'

// Per-game version of TierUpsell — shown in place of a game's real content
// when a below-Ultimate member picks a game other than today's free-preview
// one (see lib/featuredGame.ts). Unlike TierUpsell this doesn't block the
// whole page: the game list/tabs stay visible and clickable around it, so
// the member can see the full slate exists and switch back to the one game
// they do have full access to.
export function GameLockedUpsell({ label, featuredMatchup }: { label: string; featuredMatchup?: string }) {
  return (
    <div style={{
      minHeight: 320, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24,
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14, background: 'var(--surface-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>
        <Lock size={20} color="var(--text-3)" />
      </div>
      <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>
        This game is Ultimate-only
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 340, lineHeight: 1.5, marginBottom: 18 }}>
        {featuredMatchup
          ? <>Your free preview of {label} today is <strong style={{ color: 'var(--text-2)' }}>{featuredMatchup}</strong> — upgrade to Ultimate to unlock every game, every day.</>
          : <>Upgrade to Ultimate to unlock {label} for every game, every day.</>}
      </p>
      <Link href="/pricing" style={{
        fontSize: 13, fontWeight: 700, color: 'var(--accent-fg)', background: 'var(--accent)',
        padding: '9px 18px', borderRadius: 10, textDecoration: 'none',
      }}>
        Upgrade to Ultimate
      </Link>
    </div>
  )
}
