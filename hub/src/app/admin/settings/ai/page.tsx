import { CheckCircle2, XCircle } from 'lucide-react'

// Server component so we can check env var PRESENCE without ever shipping
// the actual key value to the client — same reasoning as the Payments page.
export default function AdminAiSettingsPage() {
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">AI Settings</h1>
      <p className="text-xs text-[var(--text-3)] mb-6">
        Status of the article generation service. The API key is managed in Vercel; model settings are managed in the application configuration.
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">Anthropic API Key</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">ANTHROPIC_API_KEY — set in Vercel project env vars, not here</p>
          </div>
          {hasAnthropicKey ? (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--green)]"><CheckCircle2 size={14} /> Configured</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--red)]"><XCircle size={14} /> Missing</span>
          )}
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-sm font-medium text-[var(--text-1)]">AI Blog Generation Model</p>
          <span className="text-xs font-mono text-[var(--text-2)]">claude-haiku-4-5-20251001</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-sm font-medium text-[var(--text-1)]">Default Tone</p>
          <span className="text-xs font-mono text-[var(--text-2)]">analytical (client-selectable)</span>
        </div>
      </div>
    </div>
  )
}
