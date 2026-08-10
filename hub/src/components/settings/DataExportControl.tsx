'use client'

import { useEffect, useState } from 'react'
import { Check, Download, LoaderCircle } from 'lucide-react'

type ExportRequest = { id: string; status: string; requested_at: string; completed_at?: string | null; expires_at?: string | null; error?: string | null }

export function DataExportControl() {
  const [requests, setRequests] = useState<ExportRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    const response = await fetch('/api/account/data-export', { cache: 'no-store' })
    const result = await response.json().catch(() => ({}))
    if (response.ok) setRequests(result.requests ?? [])
    else setError(result.error || 'Could not load export status')
    setLoading(false)
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/account/data-export', { cache: 'no-store', signal: controller.signal })
      .then(async response => ({ response, result: await response.json().catch(() => ({})) }))
      .then(({ response, result }) => {
        if (response.ok) setRequests(result.requests ?? [])
        else setError(result.error || 'Could not load export status')
        setLoading(false)
      })
      .catch(fetchError => {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') return
        setError('Could not load export status')
        setLoading(false)
      })
    return () => controller.abort()
  }, [])

  async function requestExport() {
    setLoading(true); setError('')
    const response = await fetch('/api/account/data-export', { method: 'POST' })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) setError(result.error || 'Could not prepare export')
    await load()
  }

  const available = requests.find(item => item.status === 'ready')
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {available ? (
        <a href={`/api/account/data-export/${available.id}/download`} className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-3 py-2 text-xs font-black text-black hover:bg-lime-300">
          <Download size={14} /> Download JSON export
        </a>
      ) : (
        <button onClick={requestExport} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:border-lime-400/35 hover:text-white disabled:opacity-50">
          {loading ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />} Prepare data export
        </button>
      )}
      {requests[0]?.status === 'delivered' && !available ? <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500"><Check size={12} /> Last export downloaded</span> : null}
      {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
    </div>
  )
}
