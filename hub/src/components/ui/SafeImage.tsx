'use client'

import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react'

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
  fallback?: ReactNode
  onFailure?: () => void
}

function isUsableImageSource(source: string) {
  return source.startsWith('/') || source.startsWith('https://') || source.startsWith('data:image/') || source.startsWith('blob:')
}

/**
 * Resilient media for user uploads and third-party sports feeds. Those URLs
 * can expire independently of a deployment, so callers always retain a
 * stable fallback instead of showing a broken-image glyph.
 */
export function SafeImage({ src, fallback = null, onFailure, alt, loading = 'lazy', decoding = 'async', onError, ...props }: SafeImageProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const image = useRef<HTMLImageElement>(null)
  const reportedFailure = useRef<string | null>(null)
  const failed = Boolean(src && failedSource === src)

  useEffect(() => {
    const node = image.current
    if (!node || !src) return
    const fail = () => {
      setFailedSource(src)
      if (reportedFailure.current !== src) { reportedFailure.current = src; onFailure?.() }
    }
    // Cached failures can finish before hydration attaches React's handler.
    // A native listener also covers a later failure without retrying an upload
    // or resetting a successfully loaded image when its surrounding theme changes.
    node.addEventListener('error', fail)
    if (node.complete && node.naturalWidth === 0) fail()
    return () => node.removeEventListener('error', fail)
  }, [onFailure, src])

  if (!src || !isUsableImageSource(src) || failed) return <>{fallback}</>

  return (
    // Dynamic member and provider URLs cannot all be known to next/image at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      ref={image}
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      onError={(event) => {
        setFailedSource(src ?? null)
        if (src && reportedFailure.current !== src) { reportedFailure.current = src; onFailure?.() }
        onError?.(event)
      }}
    />
  )
}
