import { CheckCircle2, XCircle } from 'lucide-react'

// Server component so we can check env var PRESENCE without ever shipping
// the actual key value to the client — same reasoning as the Payments page.
export default function AdminAiSettingsPage() {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">AI Settings</h1>
      <p className="text-xs text-zinc-500 mb-6">
        AI blog generation uses Claude directly (hub/src/app/api/ai/blog/route.ts) — model and tone are hardcoded in that route right now, not configurable from here. This page is status-only until that's wired to real settings.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-white">Anthropic API Key</p>
            <p className="text-xs text-zinc-500 mt-0.5">ANTHROPIC_API_KEY — set in Vercel project env vars, not here</p>
          </div>
          {hasAnthropicKey ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><CheckCircle2 size={14} /> Configured</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><XCircle size={14} /> Missing</span>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-sm font-medium text-white">AI Blog Generation Model</p>
          <span className="text-xs font-mono text-zinc-400">claude-haiku-4-5-20251001</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-sm font-medium text-white">Default Tone</p>
          <span className="text-xs font-mono text-zinc-400">analytical (client-selectable)</span>
        </div>
      </div>
    </div>
  )
}
