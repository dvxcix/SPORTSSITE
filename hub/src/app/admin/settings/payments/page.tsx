import { CheckCircle2, WalletCards, XCircle } from 'lucide-react'

// Server component so configuration values never reach the browser.
export default function AdminPaymentsSettingsPage() {
  const groups = [
    {
      title: 'SlipSurge memberships',
      description: 'Checkout, renewals, cancellations, and tier entitlements.',
      checks: [
        { label: 'Whop API key', envVar: 'WHOP_API_KEY', present: !!process.env.WHOP_API_KEY },
        { label: 'Whop webhook key', envVar: 'WHOP_WEBHOOK_KEY', present: !!process.env.WHOP_WEBHOOK_KEY },
      ],
    },
    {
      title: 'Creator platform',
      description: 'Connected creator companies, marketplace checkout, balances, and payouts.',
      checks: [
        { label: 'Whop platform API key', envVar: 'WHOP_PLATFORM_API_KEY', present: !!process.env.WHOP_PLATFORM_API_KEY },
        { label: 'Whop platform company ID', envVar: 'WHOP_PLATFORM_COMPANY_ID', present: !!process.env.WHOP_PLATFORM_COMPANY_ID },
      ],
    },
    {
      title: 'Ultimate add-on',
      description: 'The separate Whop business used for the Discord community add-on.',
      checks: [
        { label: 'Add-on Whop API key', envVar: 'ADDON_WHOP_KEY', present: !!process.env.ADDON_WHOP_KEY },
        { label: 'Add-on Whop webhook key', envVar: 'ADDON_WHOP_WEBHOOK', present: !!process.env.ADDON_WHOP_WEBHOOK },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-lime-400/25 bg-lime-400/10 text-lime-300"><WalletCards size={19} /></span>
        <div><h1 className="text-xl font-black text-white">Whop payments</h1><p className="mt-1 text-sm text-zinc-400">SlipSurge uses Whop exclusively for platform memberships, creator checkout, billing, and payouts.</p></div>
      </div>

      <div className="grid gap-4">
        {groups.map(group => <section key={group.title} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
          <header className="border-b border-zinc-800 px-4 py-3"><h2 className="text-sm font-bold text-white">{group.title}</h2><p className="mt-1 text-xs text-zinc-500">{group.description}</p></header>
          <div className="divide-y divide-zinc-800">{group.checks.map(check => <div key={check.envVar} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">{check.label}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-zinc-500">{check.envVar}</p>
            </div>
            {check.present ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><CheckCircle2 size={14} /> Configured</span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-bold text-red-400"><XCircle size={14} /> Missing</span>
            )}
          </div>)}</div>
        </section>)}
      </div>
    </div>
  )
}
