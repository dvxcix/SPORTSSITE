'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { EmojiPicker } from '@/components/social/EmojiPicker'
import { LinkifiedText } from '@/components/social/LinkifiedText'
import { BANNER_PRESETS, type SiteBanner } from '@/lib/banner'
import { X } from 'lucide-react'

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2 text-sm font-bold text-zinc-300"
    >
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-zinc-700'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-1'}`} />
      </span>
      {label}
    </button>
  )
}

export function SiteBannerManager({ initialBanner }: { initialBanner: SiteBanner | null }) {
  const [message, setMessage] = useState(initialBanner?.message ?? '')
  const [bgColor, setBgColor] = useState(initialBanner?.bg_color ?? '#22c55e')
  const [textColor, setTextColor] = useState(initialBanner?.text_color ?? '#052e16')
  const [isActive, setIsActive] = useState(initialBanner?.is_active ?? false)
  const [dismissible, setDismissible] = useState(initialBanner?.dismissible ?? true)
  const [linkUrl, setLinkUrl] = useState(initialBanner?.link_url ?? '')
  const [linkLabel, setLinkLabel] = useState(initialBanner?.link_label ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()
  const router = useRouter()

  function insertAtCursor(insertion: string) {
    const el = textareaRef.current
    const start = el?.selectionStart ?? message.length
    const end = el?.selectionEnd ?? message.length
    const next = message.slice(0, start) + insertion + message.slice(end)
    setMessage(next)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + insertion.length, start + insertion.length)
    })
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    const { error: err } = await supabase.from('site_banner').update({
      message: message.trim(),
      bg_color: bgColor,
      text_color: textColor,
      is_active: isActive,
      dismissible,
      link_url: linkUrl.trim() || null,
      link_label: linkLabel.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1)
    setSaving(false)
    if (err) { setError(err.message); return }
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">{error}</div>}

      {/* Live preview — same markup/logic as the real SiteBanner component */}
      <div>
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Preview</p>
        <div className="rounded-xl overflow-hidden border border-zinc-800">
          {message.trim() ? (
            <div style={{ position: 'relative', background: bgColor, color: textColor }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '8px 40px', fontSize: 13, fontWeight: 700, textAlign: 'center', lineHeight: 1.4, flexWrap: 'wrap',
              }}>
                <span><LinkifiedText text={message} /></span>
                {linkUrl.trim() && (
                  <span style={{ textDecoration: 'underline', fontWeight: 800 }}>{linkLabel.trim() || 'Learn more'} →</span>
                )}
              </div>
              {dismissible && (
                <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.65 }}>
                  <X size={14} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-zinc-900 px-4 py-3 text-sm text-zinc-600 text-center">Nothing to show — write a message below.</div>
          )}
        </div>
        {!isActive && <p className="text-xs text-zinc-600 mt-1.5">Inactive — this preview is what it'll look like once you flip it on, not what's live right now.</p>}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Message</label>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="🚧 We're doing scheduled maintenance — some features may be unavailable."
            rows={2}
            maxLength={280}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50 resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <EmojiPicker onSelect={insertAtCursor} />
            <span className="text-xs text-zinc-600">{message.length}/280</span>
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Link URL (optional)</label>
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-bold text-zinc-400 mb-1.5">Link label</label>
            <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Learn more"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-green-500/50" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-1.5">Colors</label>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer" />
              <span className="text-xs text-zinc-500">Background</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)}
                className="w-9 h-9 rounded-lg border border-zinc-700 bg-zinc-800 cursor-pointer" />
              <span className="text-xs text-zinc-500">Text</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {BANNER_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setBgColor(p.bg); setTextColor(p.text) }}
                  title={p.label}
                  className="w-7 h-7 rounded-full border-2 border-zinc-700 hover:border-white transition-colors"
                  style={{ background: p.bg }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6 pt-1">
          <Toggle checked={isActive} onChange={setIsActive} label="Active" />
          <Toggle checked={dismissible} onChange={setDismissible} label="Dismissible" />
        </div>

        <button onClick={save} disabled={saving}
          className="bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-colors">
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Banner'}
        </button>
      </div>
    </div>
  )
}
