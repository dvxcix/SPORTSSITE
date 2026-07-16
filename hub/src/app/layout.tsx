import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { RootLayoutShell } from '@/components/layout/RootLayoutShell'
import { SiteBanner } from '@/components/layout/SiteBanner'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SlipSurge — The Social Hub for Sports & Betting',
  description: 'Live scores, picks, community channels, and creator content — all in one place.',
}

export const viewport: Viewport = {
  themeColor: '#B4FF4D',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-zinc-950 text-white antialiased`}>
        <SiteBanner />
        <AuthProvider>
          <RootLayoutShell>
            {children}
          </RootLayoutShell>
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
