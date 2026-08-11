'use client'

import { useEffect } from 'react'
import { PageState } from './PageState'

export function DataRouteError({ error, reset, label = 'page' }: { error: Error & { digest?: string }; reset: () => void; label?: string }) {
  useEffect(() => {
    console.error(`SlipSurge ${label} error`, error)
  }, [error, label])

  return (
    <PageState
      kind="error"
      title={`${label[0].toUpperCase()}${label.slice(1)} unavailable`}
      message="We could not load this view. Your account and saved data are safe."
      actionLabel="Try again"
      onAction={reset}
    />
  )
}

export function DataRouteLoading({ label = 'data' }: { label?: string }) {
  return (
    <PageState
      kind="loading"
      title={`Loading ${label}`}
      message="Syncing the latest available data and preparing your view."
    />
  )
}
