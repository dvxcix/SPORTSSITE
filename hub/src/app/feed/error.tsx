'use client'
import { DataRouteError } from '@/components/layout/DataRouteState'
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { return <DataRouteError error={error} reset={reset} label="feed" /> }
