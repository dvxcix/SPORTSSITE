'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ArrowRight } from 'lucide-react'

const SUGGESTIONS = [
  'Best MLB picks for the week ahead',
  'How to handicap NFL totals like a pro',
  'Top 5 mistakes beginner bettors make',
  'Breaking down the best sportsbook promos right now',
  'My 10-game parlay breakdown — what went wrong',
]

export function AIBlogWriter({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [prompt, setPrompt] = useState('')
  const [sport, setSport] = useState('')
  const [tone, setTone] = useState('analytical')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<{ title: string; content: string; excerpt: string } | null>(null)
  const [saving, setSaving] = useState(false)

  async function generate() {
    if (!prompt.trim()) return
    setGenerating(true)
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
        // Fallback: generate a simple placeholder so the UI doesn't break
        setDraft({
          title: prompt.trim(),
          excerpt: `An in-depth look at: ${prompt.trim()}`,
          content: `# ${prompt.trim()}\n\n[AI generation requires API key configuration. Edit this draft to add your content.]\n\n## Introduction\n\nThis article covers ${prompt.trim()}.\n\n## Key Points\n\n- Point one\n- Point two\n- Point three\n\n## Conclusion\n\nIn conclusion, ${prompt.trim()} is an important topic for sports bettors to understand.`,
        })
      }
    } catch {
      setDraft({
        title: prompt.trim(),
        excerpt: `Analysis: ${prompt.trim()}`,
        content: `# ${prompt.trim()}\n\nEdit this draft to add your content.`,
      })
    }
    setGenerating(false)
  }

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    function slug(t: string) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now() }
    const { data } = await supabase.from('blogs').insert({
      author_id: userId,
      title: draft.title,
      slug: slug(draft.title),
      excerpt: draft.excerpt,
      content: draft.content,
      sport: sport || null,
      category: 'AI Generated',
      status: 'draft',
      view_count: 0,
    }).select('slug').single()
    router.push(`/blog/create?from=${data?.slug}`)
  }

  return (
    <div className="space-y-4">
      {!draft ? (
        <>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-zinc-400 mb-1.5">What should the article be about?</label>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                placeholder="e.g. 'Best value bets in the MLB this week' or 'How I built a 60% win rate on spread bets'"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Sport</label>
                <select value={sport} onChange={e => setSport(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
                  <option value="">Any</option>
                  {['MLB', 'NFL', 'NBA', 'NHL', 'Soccer', 'MMA'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-zinc-400 mb-1.5">Tone</label>
                <select value={tone} onChange={e => setTone(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none">
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
            <p className="text-xs font-bold text-zinc-500">Try these:</p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setPrompt(s)}
                className="flex items-center gap-2 w-full text-left text-xs text-zinc-400 hover:text-white bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 px-3 py-2 rounded-lg transition-all">
                <ArrowRight size={10} /> {s}
              </button>
            ))}
          </div>

          <button onClick={generate} disabled={generating || !prompt.trim()}
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-black py-3 rounded-xl transition-colors">
            {generating ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Sparkles size={16} /> Generate Article</>}
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-xs font-bold text-green-400 mb-1">Draft ready! Review and edit before publishing.</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
            <input value={draft.title} onChange={e => setDraft(d => d ? { ...d, title: e.target.value } : d)}
              className="w-full bg-transparent text-xl font-black text-white outline-none border-b border-zinc-800 pb-3" />
            <input value={draft.excerpt} onChange={e => setDraft(d => d ? { ...d, excerpt: e.target.value } : d)}
              placeholder="Excerpt…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none" />
            <textarea value={draft.content} onChange={e => setDraft(d => d ? { ...d, content: e.target.value } : d)}
              rows={16}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-200 outline-none resize-y font-mono" />
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDraft(null)}
              className="flex-1 border border-zinc-700 text-zinc-400 hover:text-white font-bold py-2.5 rounded-xl transition-colors">
              Start over
            </button>
            <button onClick={saveDraft} disabled={saving}
              className="flex-1 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black py-2.5 rounded-xl transition-colors">
              {saving ? 'Saving…' : 'Save & Edit Draft'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
