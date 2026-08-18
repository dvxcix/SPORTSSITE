'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Clapperboard, Download, Film, ImageIcon, LoaderCircle, Sparkles, Target, Video } from 'lucide-react'
import { ContactFlightStage } from '@/components/contact/ContactFlightStage'
import type { DailyContactSlate } from '@/lib/contactRecapTypes'

const todayEt = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export function ContactRecapStudio() {
  const [date, setDate] = useState(todayEt)
  const [data, setData] = useState<DailyContactSlate | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
    {loading ? <div className="grid min-h-80 place-items-center rounded-3xl border border-zinc-800 bg-zinc-950"><LoaderCircle className="animate-spin text-lime-300" size={28}/></div> : error ? <div className="rounded-3xl border border-red-400/20 bg-red-400/5 p-6 text-sm text-red-300">{error}</div> : data ? <>
      <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><Film size={18}/></span><div><h2 className="text-xl font-black text-white">Home Run Flight</h2><p className="text-xs text-zinc-500">Every confirmed homer with frozen pregame prices and qualifying power markets.</p></div><div className="ml-auto flex flex-wrap gap-2"><a className="inline-flex items-center gap-2 rounded-xl bg-lime-400 px-4 py-2.5 text-xs font-black text-black shadow-[0_0_24px_rgba(163,255,63,.18)] transition hover:bg-lime-300" href={`/api/admin/contact-recap-export?date=${date}&kind=hr&format=mp4`} download><Video size={15}/> Social MP4</a><a className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-4 py-2.5 text-xs font-black text-zinc-200 transition hover:bg-white/[.08]" href={`/api/admin/contact-recap-export?date=${date}&kind=hr&format=gif`} download><ImageIcon size={15}/> GIF</a></div></div><ContactFlightStage events={data.homeRuns} title="Today's Home Runs" eyebrow="Game-by-game flight log" tone="home_run"/></section>
      <section className="space-y-3"><div className="flex flex-wrap items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-orange-400/25 bg-orange-400/10 text-orange-300"><Target size={18}/></span><div><h2 className="text-xl font-black text-white">Near Home Run Flight</h2><p className="text-xs text-zinc-500">Would-have-left contacts with their actual single, double, or triple closing markets.</p></div><div className="ml-auto flex flex-wrap gap-2"><a className="inline-flex items-center gap-2 rounded-xl bg-orange-300 px-4 py-2.5 text-xs font-black text-black transition hover:bg-orange-200" href={`/api/admin/contact-recap-export?date=${date}&kind=near&format=mp4`} download><Video size={15}/> Social MP4</a><a className="inline-flex items-center gap-2 rounded-xl border border-orange-300/25 bg-orange-400/10 px-4 py-2.5 text-xs font-black text-orange-200 transition hover:bg-orange-400/15" href={`/api/admin/contact-recap-export?date=${date}&kind=near&format=gif`} download><Download size={15}/> GIF</a></div></div><ContactFlightStage events={data.nearHomeRuns} title="Today's Near Home Runs" eyebrow="Park-adjusted contact log" tone="near_hr"/></section>
      <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[.035] p-4"><p className="flex items-center gap-2 text-xs font-black text-cyan-200"><Sparkles size={15}/> Data integrity</p><ul className="mt-2 space-y-1 text-[11px] leading-5 text-zinc-500">{data.dataNotes.map(note => <li key={note}>• {note}</li>)}</ul></section>
    </> : null}
  </div>
}
