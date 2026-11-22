import { CheckCircle2, WalletCards, XCircle } from 'lucide-react'
import { creatorPlatformHealth } from '@/lib/creatorPlatformHealth'
import { CreatorPlatformPanel } from '@/app/creators/studio/CreatorPlatformPanel'

// Server component so configuration values never reach the browser.
export default async function AdminPaymentsSettingsPage() {
  const platform = await creatorPlatformHealth()
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
        { label: 'Whop platform API credentials', envVar: 'Platform key or shared Whop key', present: platform.apiConfigured },
        { label: 'Whop platform account', envVar: 'Platform account or shared Whop account', present: platform.companyConfigured },
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
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-[color-mix(in_srgb,var(--accent)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--accent)]"><WalletCards size={19} /></span>
        <div><h1 className="text-xl font-semibold text-[var(--text-1)]">Whop payments</h1><p className="mt-1 text-sm text-[var(--text-2)]">SlipSurge uses Whop exclusively for platform memberships, creator checkout, billing, and payouts.</p></div>
      </div>
      <section className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"><h2 className="font-semibold">Creator payments · {platform.verified && platform.accountMatches ? 'Connected' : platform.apiConfigured ? 'Verification needed' : 'Not configured'}</h2><p className="mt-2 text-sm text-[var(--text-2)]">Fees are managed in Whop. SlipSurge adds no separate application fee to creator offers.</p><CreatorPlatformPanel /></section>

      <div className="grid gap-4">
        {groups.map(group => <section key={group.title} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <header className="border-b border-[var(--border)] px-4 py-3"><h2 className="text-sm font-bold text-[var(--text-1)]">{group.title}</h2><p className="mt-1 text-xs text-[var(--text-3)]">{group.description}</p></header>
          <div className="divide-y divide-[var(--border)]">{group.checks.map(check => <div key={check.envVar} className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-1)]">{check.label}</p>
              <p className="mt-0.5 truncate font-mono text-xs text-[var(--text-3)]">{check.envVar}</p>
            </div>
            {check.present ? (
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--green)]"><CheckCircle2 size={14} /> Configured</span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--red)]"><XCircle size={14} /> Missing</span>
            )}
          </div>)}</div>
        </section>)}
      </div>
    </div>
  )
}
