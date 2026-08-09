'use client'

import { FeedbackState } from '@/components/ui/feedback-state'

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="mx-auto max-w-3xl p-6"><FeedbackState tone="error" title="This admin tool could not load" description="The rest of the control panel is still available. Retry this request or choose another tool." actionLabel="Try again" onAction={reset} /></div>
}
