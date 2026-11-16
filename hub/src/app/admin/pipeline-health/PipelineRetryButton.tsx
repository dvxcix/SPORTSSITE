'use client'

import { useState } from 'react'
import { Check, LoaderCircle, RotateCcw } from 'lucide-react'

export function PipelineRetryButton({ jobName }: { jobName: string }) {
  return <div className="flex flex-col gap-1">
    <PipelineAction jobName={jobName} action="run" label={jobName === 'market-dna-maintenance' ? 'Archive' : 'Run'}/>
    {jobName === 'market-dna-maintenance' && <PipelineAction jobName={jobName} action="fit" label="Fit model"/>}
    {jobName === 'slate-drop' && <PipelineAction jobName={jobName} action="preview" label="Preview slate"/>}
    {jobName === 'poll-pikkit-nfl-picks' && <NflGameRefresh jobName={jobName}/>}
  </div>
}

function NflGameRefresh({ jobName }: { jobName: string }) {
  const [gameId, setGameId] = useState('')
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = async () => {
    setRunning(true)
    setMessage('')
    try {
      const response = await fetch('/api/admin/pipeline-retry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName, action: 'nfl-game', gameId: gameId.trim() }),
      })
      const result = await response.json()
      setMessage(response.ok
        ? result.markets + ' markets refreshed at ' + new Date(result.capturedAt).toLocaleTimeString([], { timeZone: 'America/New_York' }) + ' ET'
        : result.error ?? 'Refresh failed')
    } catch {
      setMessage('Refresh result unavailable')
    } finally {
      setRunning(false)
    }
  }

  return <div className="flex flex-col gap-1">
    <label className="text-[10px] text-zinc-400">
      NFL game ID
      <input value={gameId} onChange={event => setGameId(event.target.value)} disabled={running}
        className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 text-xs text-white"/>
    </label>
    <button type="button" onClick={() => void refresh()} disabled={running || !gameId.trim()}
      className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-black text-zinc-300 hover:border-lime-300/30 hover:text-lime-300 disabled:opacity-50">
      {running ? 'Refreshing picks…' : 'Refresh one NFL game'}
    </button>
    {message && <p role="status" className="text-[10px] text-zinc-400">{message}</p>}
  </div>
}

function PipelineAction({ jobName, action, label }: { jobName: string; action: 'run' | 'fit' | 'preview'; label: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle')
  const [result, setResult] = useState('')
  const retry = async () => {
    setState('loading')
    setResult('')
    try {
      const response = await fetch('/api/admin/pipeline-retry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName, action }),
      })
      if (action === 'preview' && response.ok) {
        const body = await response.json()
        setResult(body.skipped ? 'Not configured' : `${body.games} games · no send`)
        setState('idle')
      } else setState(response.ok ? 'queued' : 'error')
    } catch { setState('error') }
  }
  return <div>
    <button type="button" onClick={() => void retry()} disabled={state === 'loading' || state === 'queued'} className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-black transition ${state === 'error' ? 'border-red-400/25 text-red-300' : 'border-white/10 text-zinc-400 hover:border-lime-300/30 hover:text-lime-300'}`}>
      {state === 'loading' ? <LoaderCircle size={12} className="animate-spin"/> : state === 'queued' ? <Check size={12}/> : <RotateCcw size={12}/>} {state === 'queued' ? 'Queued' : state === 'error' ? 'Retry failed' : label}
    </button>
    {result && <p role="status" className="mt-1 text-[10px] text-zinc-400">{result}</p>}
  </div>
}
