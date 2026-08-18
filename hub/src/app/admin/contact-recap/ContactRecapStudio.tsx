'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Check, Clapperboard, Copy, Download, Film, ImageIcon, LoaderCircle, Monitor, RotateCcw, Smartphone, Sparkles, Square, Target, Trash2, Video } from 'lucide-react'
import { ContactFlightStage } from '@/components/contact/ContactFlightStage'
import type { DailyContactSlate } from '@/lib/contactRecapTypes'

const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
type ExportAspect = 'landscape' | 'square' | 'vertical'
type ExportJob = {
  id: string
  recap_date: string
  kind: 'hr' | 'near'
  format: 'mp4' | 'gif'
  aspect: ExportAspect
  status: 'queued' | 'running' | 'retrying' | 'completed' | 'failed' | 'expired'
  progress: number
  stage: string
  filename: string | null
  byte_size: number | null
  attempt_count: number
  error: string | null
  created_at: string
  expires_at: string
}

function ExportButton({ date, kind, format, aspect, primary = false, activeExport, setActiveExport }: {
  date: string
  kind: 'hr' | 'near'
  format: 'mp4' | 'gif'
  aspect: ExportAspect
  primary?: boolean
  activeExport: string | null
  setActiveExport: (value: string | null) => void
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const Icon = format === 'mp4' ? Video : ImageIcon
  const exportKey = `${kind}:${format}:${aspect}`
  const isGenerating = activeExport === exportKey
  const download = async () => {
    if (activeExport) return
    setActiveExport(exportKey); setStatus('loading'); setMessage('')
    try {
      const response = await fetch('/api/admin/contact-recap-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, kind, format, aspect }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error || `Could not queue export (${response.status}).`)
      }
      setStatus('done')
      setMessage('Queued. You can leave this page while it renders.')
      window.dispatchEvent(new Event('slipsurge:export-queued'))
    } catch (reason) {
      setStatus('error'); setMessage(reason instanceof Error ? reason.message : 'Could not create this export.')
    } finally {
      setActiveExport(null)
    }
  }
  const base = 'inline-flex min-w-32 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition disabled:cursor-wait disabled:opacity-70'
  const tone = primary
    ? kind === 'hr' ? 'bg-lime-400 text-black shadow-[0_0_24px_rgba(163,255,63,.18)] hover:bg-lime-300' : 'bg-orange-300 text-black hover:bg-orange-200'
    : kind === 'hr' ? 'border border-white/10 bg-white/[.04] text-zinc-200 hover:bg-white/[.08]' : 'border border-orange-300/25 bg-orange-400/10 text-orange-200 hover:bg-orange-400/15'
  return <div className="flex flex-col items-stretch gap-1.5">
    <button className={`${base} ${tone}`} type="button" disabled={Boolean(activeExport)} onClick={download}>
      {isGenerating ? <LoaderCircle className="animate-spin" size={15}/> : <Icon size={15}/>}
      {isGenerating ? `Queueing ${format.toUpperCase()}…` : status === 'done' ? 'Queued' : status === 'error' ? 'Try again' : format === 'mp4' ? 'Social MP4' : 'GIF'}
    </button>
    {message ? <span className="max-w-52 text-[10px] font-semibold leading-4 text-red-300">{message}</span> : null}
  </div>
}

function ExportQueue({ jobs, refresh }: { jobs: ExportJob[]; refresh: () => void }) {
  if (!jobs.length) return null
  const act = async (job: ExportJob, action: 'download' | 'retry' | 'delete') => {
    if (action === 'download') {
      const response = await fetch(`/api/admin/contact-recap-jobs/${job.id}`, { cache: 'no-store' })
      const body = await response.json() as { downloadUrl?: string }
      if (body.downloadUrl) window.location.assign(body.downloadUrl)
      return
    }
    await fetch(`/api/admin/contact-recap-jobs/${job.id}`, { method: action === 'delete' ? 'DELETE' : 'POST' })
    refresh()
  }
  return <section className="rounded-3xl border border-white/10 bg-zinc-950/75 p-4 sm:p-5">
    <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-black text-white">Export queue</h2><p className="mt-1 text-[11px] text-zinc-500">Renders continue after refreshes and deployments. Downloads remain private for seven days.</p></div><button type="button" onClick={refresh} className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white" aria-label="Refresh export queue"><RotateCcw size={15}/></button></div>
    <div className="space-y-2">{jobs.slice(0, 8).map(job => {
      const active = job.status === 'queued' || job.status === 'running' || job.status === 'retrying'
      return <article key={job.id} className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 sm:grid-cols-[minmax(0,1fr)_130px_auto] sm:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-white">{job.kind === 'hr' ? 'Home Run Flight' : 'Near Home Run Flight'}</strong><span className="rounded-md bg-white/[.06] px-2 py-1 font-mono text-[9px] font-black uppercase text-zinc-400">{job.format} · {job.aspect}</span><span className={`text-[10px] font-black uppercase ${job.status === 'completed' ? 'text-lime-300' : job.status === 'failed' ? 'text-red-300' : 'text-cyan-300'}`}>{job.status}</span></div><p className="mt-1 truncate text-[11px] text-zinc-500">{job.recap_date} · {job.error || job.stage}</p></div>
        <div><div className="mb-1 flex justify-between text-[9px] font-bold text-zinc-500"><span className="truncate">{job.stage}</span><span>{job.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className={`h-full rounded-full transition-all ${job.status === 'failed' ? 'bg-red-400' : 'bg-lime-300'}`} style={{ width: `${job.progress}%` }}/></div></div>
        <div className="flex justify-end gap-2">{job.status === 'completed' ? <button type="button" onClick={() => void act(job, 'download')} className="inline-flex items-center gap-1.5 rounded-xl bg-lime-300 px-3 py-2 text-[10px] font-black text-black"><Download size={13}/> Download</button> : null}{job.status === 'failed' ? <button type="button" onClick={() => void act(job, 'retry')} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300/25 px-3 py-2 text-[10px] font-black text-amber-200"><RotateCcw size={13}/> Retry</button> : null}{!active ? <button type="button" onClick={() => void act(job, 'delete')} className="rounded-xl border border-white/10 p-2 text-zinc-500 hover:text-red-300" aria-label="Delete export"><Trash2 size={13}/></button> : null}</div>
      </article>
    })}</div>
  </section>
}

function CaptionButton({ date, kind, data }: { date: string; kind: 'hr' | 'near'; data: DailyContactSlate }) {
  const [copied, setCopied] = useState(false)
  const events = kind === 'hr' ? data.homeRuns : data.nearHomeRuns
  const copy = async () => {
    const names = events.slice(0, 6).map(event => event.batterName).join(', ')
    const remainder = events.length > 6 ? ` + ${events.length - 6} more` : ''
    const gameCount = new Set(events.map(event => event.gamePk)).size
    const label = kind === 'hr' ? 'home run flight log' : 'near-home-run flight log'
    const caption = `SlipSurge ${label} · ${date}\n${events.length} event${events.length === 1 ? '' : 's'} across ${gameCount} game${gameCount === 1 ? '' : 's'}.${names ? `\n${names}${remainder}` : ''}\n\nslipsurge.com`
    try {
      await navigator.clipboard.writeText(caption)
    } catch {
      const fallback = document.createElement('textarea')
      fallback.value = caption
      fallback.style.position = 'fixed'
      fallback.style.opacity = '0'
      document.body.appendChild(fallback)
      fallback.select()
      document.execCommand('copy')
      fallback.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <button type="button" onClick={copy} disabled={!events.length} className="inline-flex min-w-32 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-black text-zinc-200 transition hover:border-lime-300/30 hover:bg-white/[.08] disabled:cursor-not-allowed disabled:opacity-40">
    {copied ? <Check size={15} className="text-lime-300"/> : <Copy size={15}/>} {copied ? 'Caption copied' : 'Copy caption'}
  </button>
}

export function ContactRecapStudio() {
  const [date, setDate] = useState(todayEt)
  const [data, setData] = useState<DailyContactSlate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeExport, setActiveExport] = useState<string | null>(null)
  const [aspect, setAspect] = useState<ExportAspect>('landscape')
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const loadJobs = () => fetch('/api/admin/contact-recap-jobs', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : { jobs: [] })
    .then(body => setJobs(body.jobs ?? []))
  useEffect(() => {
    const refresh = () => void loadJobs()
    refresh()
    window.addEventListener('slipsurge:export-queued', refresh)
    return () => window.removeEventListener('slipsurge:export-queued', refresh)
  }, [])
  useEffect(() => {
    if (!jobs.some(job => job.status === 'queued' || job.status === 'running' || job.status === 'retrying')) return
    const timer = window.setTimeout(() => void loadJobs(), 2500)
    return () => window.clearTimeout(timer)
  }, [jobs])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/admin/contact-recap?date=${date}`, { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Could not load recap'); return body })
      .then(setData).catch(reason => { if (reason.name !== 'AbortError') setError(reason.message) }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [date])

  return <div className="mx-auto w-full max-w-[1540px] space-y-6 p-3 pb-24 sm:p-6">
    <section className="overflow-hidden rounded-[28px] border border-lime-400/20 bg-[radial-gradient(circle_at_10%_0%,rgba(163,255,63,.16),transparent_30%),linear-gradient(135deg,#11170f,#080b11_58%,#05070a)] p-5 shadow-2xl sm:p-8">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl"><p className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[.2em] text-lime-300"><Clapperboard size={14}/> Publishing studio</p><h1 className="mt-3 text-3xl font-black tracking-[-.045em] text-white sm:text-5xl">Daily Contact Recap</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Produce game-by-game home-run and near-home-run flight graphics from the same official event stream and park geometry used across SlipSurge.</p></div>
        <label className="flex min-w-56 items-center gap-3 rounded-2xl border border-white/10 bg-black/35 p-3 text-xs font-bold text-zinc-400"><CalendarDays size={17} className="text-lime-300"/><span>Date</span><input className="ml-auto bg-transparent font-mono text-white outline-none" type="date" value={date} max={todayEt()} onChange={event => { setLoading(true); setError(''); setDate(event.target.value) }}/></label>
      </div>
    </section>

    <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Games captured</span><strong className="mt-1 block text-2xl text-white">{data?.games.length ?? 0}</strong></div><div className="rounded-2xl border border-lime-400/15 bg-lime-400/[.04] p-4"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Home runs</span><strong className="mt-1 block text-2xl text-lime-300">{data?.homeRuns.length ?? 0}</strong></div><div className="rounded-2xl border border-orange-400/15 bg-orange-400/[.04] p-4"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Near home runs</span><strong className="mt-1 block text-2xl text-orange-300">{data?.nearHomeRuns.length ?? 0}</strong></div></div>
    <ExportQueue jobs={jobs} refresh={() => void loadJobs()}/>
    {loading ? <div className="grid min-h-80 place-items-center rounded-3xl border border-zinc-800 bg-zinc-950"><LoaderCircle className="animate-spin text-lime-300" size={28}/></div> : error ? <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-300">{error}</div> : data ? <>
      <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,.045),rgba(255,255,255,.015))] p-4 shadow-[inset_0_1px_rgba(255,255,255,.06)] lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black text-white">Social canvas</p><p className="mt-1 text-[11px] leading-5 text-zinc-500">Choose the destination first. Every layout keeps the park, player, result, and market receipt readable.</p></div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-white/10 bg-black/35 p-1" role="group" aria-label="Social export aspect ratio">
          {([
            { value: 'landscape', label: 'Feed', ratio: '16:9', icon: Monitor },
            { value: 'square', label: 'Square', ratio: '1:1', icon: Square },
            { value: 'vertical', label: 'Story', ratio: '9:16', icon: Smartphone },
          ] as const).map(option => {
            const Icon = option.icon
            const active = aspect === option.value
            return <button key={option.value} type="button" disabled={Boolean(activeExport)} aria-pressed={active} onClick={() => setAspect(option.value)} className={`flex min-w-24 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${active ? 'bg-lime-300 text-black shadow-[0_0_24px_rgba(163,255,63,.2)]' : 'text-zinc-400 hover:bg-white/[.06] hover:text-white'}`}><Icon size={15}/><span><strong className="block text-[11px] font-black leading-3">{option.label}</strong><small className={`text-[9px] font-bold ${active ? 'text-black/60' : 'text-zinc-600'}`}>{option.ratio}</small></span></button>
          })}
        </div>
      </section>
      <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><Film size={18}/></span><div><h2 className="text-xl font-black text-white">Home Run Flight</h2><p className="text-xs text-zinc-500">Every confirmed homer with frozen pregame prices and qualifying power markets. {data.homeRuns.length} events · about {data.homeRuns.length * 2}s.</p></div><div className="ml-auto flex flex-wrap items-start gap-2"><ExportButton date={date} kind="hr" format="mp4" aspect={aspect} primary activeExport={activeExport} setActiveExport={setActiveExport}/><ExportButton date={date} kind="hr" format="gif" aspect={aspect} activeExport={activeExport} setActiveExport={setActiveExport}/></div></div><ContactFlightStage events={data.homeRuns} title="Today's Home Runs" eyebrow="Game-by-game flight log" tone="home_run"/></section>
      <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-orange-400/25 bg-orange-400/10 text-orange-300"><Target size={18}/></span><div><h2 className="text-xl font-black text-white">Near Home Run Flight</h2><p className="text-xs text-zinc-500">Would-have-left contacts with their actual single, double, or triple closing markets. {data.nearHomeRuns.length} events · about {data.nearHomeRuns.length * 2}s.</p></div><div className="ml-auto flex flex-wrap items-start gap-2"><ExportButton date={date} kind="near" format="mp4" aspect={aspect} primary activeExport={activeExport} setActiveExport={setActiveExport}/><ExportButton date={date} kind="near" format="gif" aspect={aspect} activeExport={activeExport} setActiveExport={setActiveExport}/></div></div><ContactFlightStage events={data.nearHomeRuns} title="Today's Near Home Runs" eyebrow="Park-adjusted contact log" tone="near_hr"/></section>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-lime-300/15 bg-[linear-gradient(135deg,rgba(163,255,63,.06),rgba(255,255,255,.025))] p-4 shadow-[inset_0_1px_rgba(255,255,255,.05)]"><div><p className="text-xs font-black text-white">Social publishing kit</p><p className="mt-1 text-[11px] text-zinc-500">Copy a clean caption, then pair it with the sharper MP4 export.</p></div><div className="flex flex-wrap gap-2"><CaptionButton date={date} kind="hr" data={data}/><CaptionButton date={date} kind="near" data={data}/></div></div>
      <p className="rounded-xl border border-white/5 bg-white/[.025] px-4 py-3 text-[11px] text-zinc-500">MP4 is recommended for social posts and keeps the sharpest motion at a smaller file size. GIF is best for embeds and may take longer on large slates.</p>
      <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4"><p className="flex items-center gap-2 text-xs font-black text-cyan-200"><Sparkles size={15}/> Data integrity</p><ul className="mt-2 space-y-1 text-[11px] leading-5 text-zinc-500">{data.dataNotes.map(note => <li key={note}>• {note}</li>)}</ul></section>
    </> : null}
  </div>
}
