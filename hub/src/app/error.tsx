'use client'

import { useEffect } from 'react'
import { PageState } from '@/components/layout/PageState'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Route render failed', error) }, [error])
  return <PageState kind="error" title="This page could not load" message="Your account and data are safe. Try loading the page again." actionLabel="Try again" onAction={reset} />
}
