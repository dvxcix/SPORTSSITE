'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ArrowRight, RotateCcw, Save } from 'lucide-react'

const SUGGESTIONS = [
  'Best MLB picks for the week ahead',
  'How to handicap NFL totals like a pro',
  'Top 5 mistakes beginner bettors make',
  'Breaking down the best sportsbook promos right now',
  'My 10-game parlay breakdown — what went wrong',
]

export function AIBlogWriter({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [prompt, setPrompt] = useState('')
  const [sport, setSport] = useState('')
  const [tone, setTone] = useState('analytical')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<{ title: string; content: string; excerpt: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [generationError, setGenerationError] = useState('')

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
    setGenerationError('')
    try {
      const res = await fetch('/api/ai/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), sport, tone }),
      })
      if (res.ok) {
        const data = await res.json()
        setDraft(data)
      } else {
        setGenerationError('Could not create a draft. Please try again.')
      }
    } catch {
      setGenerationError('Could not create a draft. Please try again.')
    }
    setGenerating(false)
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    setSaveError('')
    function slug(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now() }
    const { data, error } = await supabase.from('blogs').insert({
      author_id: userId,
      title: draft.title,
      slug: slug(draft.title),
      excerpt: draft.excerpt,
      content: draft.content,
      sport: sport || null,
      category: 'AI Generated',
      status: 'draft',
      view_count: 0,
    }).select('id').single()
    if (error || !data?.id) {
      setSaveError('Could not save this draft — please try again.')
      setSaving(false)
      return
    }
    router.push(`/blog/edit/${data.id}`)
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-[rgba(var(--line-rgb),0.08)] bg-gradient-to-br from-white/[.045] to-white/[.015] shadow-[0_24px_80px_rgba(0,0,0,.25)]">
      {!draft ? (
        <div className="space-y-5 p-4 sm:p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">What should the article be about?</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                placeholder="e.g. How tonight’s NBA injuries change minutes and roles"
                className="ss-flow-input min-h-28 resize-none" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Sport</label>
                <select value={sport} onChange={e => setSport(e.target.value)}
                  className="ss-flow-input">
                  <option value="">Any</option>
                  {['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-[var(--text-2)] mb-1.5">Tone</label>
                <select value={tone} onChange={e => setTone(e.target.value)}
                  className="ss-flow-input">
                  <option value="analytical">Analytical</option>
                  <option value="casual">Casual</option>
                  <option value="hype">Hype / Exciting</option>
                  <option value="educational">Educational</option>
                  <option value="opinion">Opinion / Hot Take</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold uppercase tracking-[.14em] text-[var(--text-3)]">Starting points</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setPrompt(s)}
                className="flex w-full items-center gap-2 rounded-xl border border-[rgba(var(--line-rgb),0.07)] bg-[var(--surface)] px-3 py-2.5 text-left text-xs text-[var(--text-2)] transition hover:border-[color-mix(in_srgb,var(--accent)_20%,transparent)] hover:bg-[rgba(var(--contrast-rgb),0.04)] hover:text-[var(--text-1)]">
                <ArrowRight size={10} /> {s}
              </button>
            ))}
          </div>

          {generationError && <div className="rounded-xl border border-[color-mix(in_srgb,var(--red)_20%,transparent)] bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-4 py-3 text-sm text-[var(--red)]">{generationError}</div>}
          <button onClick={generate} disabled={generating || !prompt.trim()}
            className="ss-settings-primary !min-h-11 w-full justify-center disabled:opacity-40">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Sparkles size={16} /> Generate Article</>}
          </button>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-xl border border-[color-mix(in_srgb,var(--accent)_20%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7.000000000000001%,transparent)] p-4">
            <p className="text-xs font-bold text-[var(--accent)]">Draft ready. Review every detail before publishing.</p>
          </div>
          <div className="space-y-3">
            <input value={draft.title} onChange={e => setDraft(d => d ? { ...d, title: e.target.value } : d)}
              className="w-full border-0 border-b border-[rgba(var(--line-rgb),0.08)] bg-transparent pb-3 text-2xl font-semibold tracking-[-.03em] text-[var(--text-1)] outline-none focus:border-[color-mix(in_srgb,var(--accent)_40%,transparent)]" />
            <input value={draft.excerpt} onChange={e => setDraft(d => d ? { ...d, excerpt: e.target.value } : d)}
              placeholder="Excerpt…"
              className="ss-flow-input" />
            <textarea value={draft.content} onChange={e => setDraft(d => d ? { ...d, content: e.target.value } : d)}
              rows={16}
              className="ss-flow-input min-h-[360px] resize-y font-mono leading-7" />
          </div>
          {saveError && (
            <div className="bg-[color-mix(in_srgb,var(--red)_10%,transparent)] border border-[color-mix(in_srgb,var(--red)_20%,transparent)] rounded-xl px-4 py-3 text-sm text-[var(--red)]">{saveError}</div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setDraft(null)} className="ss-settings-secondary flex-1 justify-center">
              <RotateCcw size={13}/> Start over
            </button>
            <button onClick={saveDraft} disabled={saving}
              className="ss-settings-primary flex-1 justify-center disabled:opacity-40">
              <Save size={13}/>{saving ? 'Saving…' : 'Save and edit'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
