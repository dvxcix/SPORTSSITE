import type { Metadata } from 'next'

type PageMetadataOptions = {
  title: string
  description: string
  path: string
  index?: boolean
}
export function pageMetadata({ title, description, path, index = true }: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: 'SlipSurge', images: ['https://www.slipsurge.com/og-image-1200x630.png'] },
    twitter: { card: 'summary_large_image', title, description, images: ['https://www.slipsurge.com/og-image-1200x630.png'] },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
  }
}
