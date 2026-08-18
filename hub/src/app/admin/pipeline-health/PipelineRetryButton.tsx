'use client'

import { useState } from 'react'
import { Check, LoaderCircle, RotateCcw } from 'lucide-react'

export function PipelineRetryButton({ jobName }: { jobName: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')
  const retry = async () => {
    setState('loading')
    const response = await fetch('/api/admin/pipeline-retry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobName }),
    })
    setState(response.ok ? 'queued' : 'error')
  }
  return <button type="button" onClick={() => void retry()} disabled={state === 'loading' || state === 'queued'} className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black transition ${state === 'error' ? 'border-red-400/25 text-red-300' : 'border-white/10 text-zinc-400 hover:border-lime-300/30 hover:text-lime-300'}`}>
    {state === 'loading' ? <LoaderCircle size={12} className="animate-spin"/> : state === 'queued' ? <Check size={12}/> : <RotateCcw size={12}/>} {state === 'queued' ? 'Queued' : state === 'error' ? 'Retry failed' : 'Run'}
  </button>
}
