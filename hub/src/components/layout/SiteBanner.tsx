'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { X } from 'lucide-react'
import type { SiteBanner as SiteBannerRow } from '@/lib/banner'

const DISMISS_KEY = 'ss-banner-dismissed'

// True position:sticky (not just "shows at page load") — a PSA/maintenance
// notice that scrolls away the instant you move down the page defeats the
// point. Sits above the whole app shell in the root layout; TopBar and the
// desktop sidebar both read the --banner-h custom property (set below,
// falls back to 0px when this renders nothing) for their own sticky `top`
// offset, so they stack correctly under the banner instead of both trying
// to pin to the literal top of the viewport and overlapping once you
// scroll past the banner's original position.
export function SiteBanner() {
  const [banner, setBanner] = useState<SiteBannerRow | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    supabase.from('site_banner').select('*').eq('id', 1).single().then(({ data }) => {
      if (!cancelled) setBanner(data as SiteBannerRow | null)
    })

    try { setDismissedKey(sessionStorage.getItem(DISMISS_KEY)) } catch { /* private-mode storage access can throw */ }

    const channel = supabase.channel('site-banner')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'site_banner', filter: 'id=eq.1' },
        (payload: any) => { if (!cancelled) setBanner(payload.new as SiteBannerRow) })
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [])

  const visible = !!banner?.is_active && !!banner.message.trim() && dismissedKey !== banner.updated_at

  useEffect(() => {
    function applyHeight() {
      document.documentElement.style.setProperty('--banner-h', visible && ref.current ? `${ref.current.offsetHeight}px` : '0px')
    }
    applyHeight()
    if (!visible) return
    const ro = new ResizeObserver(applyHeight)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('resize', applyHeight)
    return () => { ro.disconnect(); window.removeEventListener('resize', applyHeight) }
  }, [visible])

  if (!visible || !banner) return null

  function dismiss() {
    if (!banner) return
    try { sessionStorage.setItem(DISMISS_KEY, banner.updated_at) } catch { /* ignore */ }
    setDismissedKey(banner.updated_at)
  }

  return (
    <div
      ref={ref}
      role="status"
      style={{
        position: 'sticky', top: 0, zIndex: 60,
        background: banner.bg_color, color: banner.text_color,
        borderBottom: '1px solid rgba(0,0,0,0.15)',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        maxWidth: 1400, margin: '0 auto', padding: '8px 40px',
        fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: 1.4,
        flexWrap: 'wrap',
      }}>
        <span><LinkifiedText text={banner.message} /></span>
        {banner.link_url && (
          <a
            href={banner.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 800, flexShrink: 0 }}
          >
            {banner.link_label?.trim() || 'Learn more'} →
          </a>
        )}
      </div>
      {banner.dismissible && (
        <button
          onClick={dismiss}
          aria-label="Dismiss banner"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', color: 'inherit', opacity: 0.65,
            cursor: 'pointer', borderRadius: 6,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
