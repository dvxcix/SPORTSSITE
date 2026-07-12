import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { RootLayoutShell } from '@/components/layout/RootLayoutShell'
import { Analytics } from '@vercel/analytics/next'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SlipSurge — The Social Hub for Sports & Betting',
  description: 'Live scores, picks, community channels, and creator content — all in one place.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.className} bg-zinc-950 text-white antialiased`}>
        <AuthProvider>
          <RootLayoutShell>
            {children}
          </RootLayoutShell>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
