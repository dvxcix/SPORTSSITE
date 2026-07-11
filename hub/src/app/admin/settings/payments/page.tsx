import { CheckCircle2, XCircle } from 'lucide-react'

// Server component so we can check env var PRESENCE without ever shipping
// key values to the client. Never handle/display raw Stripe keys in a form.
export default function AdminPaymentsSettingsPage() {
  const checks = [
    { label: 'Stripe Secret Key', envVar: 'STRIPE_SECRET_KEY', present: !!process.env.STRIPE_SECRET_KEY },
    { label: 'Stripe Webhook Secret', envVar: 'STRIPE_WEBHOOK_SECRET', present: !!process.env.STRIPE_WEBHOOK_SECRET },
  ]

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Payments</h1>
      <p className="text-xs text-zinc-500 mb-6">
        Stripe keys are set as Vercel project env vars, not here — this page only shows whether each is configured. Editable pricing/plan config isn't wired to any UI yet; check hub/src/lib/stripe.ts and hub/src/app/api/stripe/webhook/route.ts directly for behavior.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {checks.map(c => (
          <div key={c.envVar} className="flex items-center justify-between px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-white">{c.label}</p>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">{c.envVar}</p>
            </div>
            {c.present ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><CheckCircle2 size={14} /> Configured</span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><XCircle size={14} /> Missing</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
