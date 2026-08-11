'use client'

import { useEffect } from 'react'
import { PageState } from '@/components/layout/PageState'

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('SlipSurge page error', error)
  }, [error])

  return (
    <PageState
      kind="error"
      title="This page hit a snag"
      message="Your account and data are safe. Try loading this page again."
      actionLabel="Try again"
      onAction={reset}
    />
  )
}
