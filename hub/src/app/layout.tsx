import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import './community.css'
import './framework.css'
import './member-experience.css'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import { themeBootstrap } from '@/lib/appearance'
import { PublicThemeControl } from '@/components/theme/PublicThemeControl'
import { DesignReviewRibbon } from '@/components/theme/DesignReviewRibbon'
import { AuthProvider } from '@/context/AuthContext'
import { PostLiveProvider } from '@/context/PostLiveContext'
import { RootLayoutShell } from '@/components/layout/RootLayoutShell'
import { SiteBanner } from '@/components/layout/SiteBanner'
import { ChangelogPopup } from '@/components/layout/ChangelogPopup'
import { FeedbackProvider } from '@/components/ui/FeedbackProvider'
import { NativeTooltipProvider } from '@/components/ui/tooltip-card'

const geist = localFont({ src: '../../public/fonts/Geist.woff2', weight: '100 900', display: 'swap', variable: '--font-geist' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://www.slipsurge.com'),
  title: 'SlipSurge | Sports Research, Picks and Community',
  description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores in one platform.',
  applicationName: 'SlipSurge',
  category: 'sports',
  creator: 'SlipSurge',
  publisher: 'SlipSurge',
  keywords: ['sports research', 'sports analytics', 'live odds', 'market movement', 'sports picks', 'creator communities'],
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'SlipSurge',
    title: 'SlipSurge | Sports Research, Picks and Community',
    description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores in one platform.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'SlipSurge sports research platform' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SlipSurge | Sports Research, Picks and Community',
    description: 'Sports research, live market movement, verified picks, creator communities, and real-time scores in one platform.',
    images: ['/og.png'],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: '/icon-192.png', type: 'image/png' }],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  themeColor: '#B4FF4D',
  // Without this, mobile Safari/Chrome leave the layout viewport (and every
  // dvh unit sized off it, like the checkout modal) at full height when the
  // on-screen keyboard opens — only the visual viewport shrinks. The keyboard
  // then sits on top of whatever was at the bottom (e.g. the checkout
  // embed's submit button) with no on-screen affordance to reveal it, since
  // there's nothing telling the layout it needs to shrink to make room.
  interactiveWidget: 'resizes-content',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <body className={`${geist.className} ${geist.variable} antialiased`}>
        <Script id="ss-appearance" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <ThemeProvider>
        <PublicThemeControl />
        {process.env.NEXT_PUBLIC_DESIGN_REVIEW === '1' && <DesignReviewRibbon />}
        <NativeTooltipProvider />
        <FeedbackProvider>
          <SiteBanner />
          <ChangelogPopup />
          <AuthProvider>
            <PostLiveProvider>
              <RootLayoutShell>
                {children}
              </RootLayoutShell>
            </PostLiveProvider>
          </AuthProvider>
        </FeedbackProvider>
        {process.env.NEXT_PUBLIC_DESIGN_REVIEW !== '1' && <><Analytics />
        <SpeedInsights />
        {/* X (Twitter) conversion tracking pixel — afterInteractive per
            next/script's own guidance for third-party analytics tags, same
            loading tier Vercel Analytics/Speed Insights above already use. */}
        <Script id="x-pixel" strategy="afterInteractive">
          {`!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='https://static.ads-twitter.com/uwt.js',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','re01u');`}
        </Script>
        </>}
        </ThemeProvider>
      </body>
    </html>
  )
}
