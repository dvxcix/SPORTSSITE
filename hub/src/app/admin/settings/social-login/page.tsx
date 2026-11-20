import { CheckCircle2 } from 'lucide-react'

// Status-only page — provider credentials/config live in the Supabase
// dashboard (Authentication → Providers), not in this app's DB, so there's
// nothing here to edit, only to confirm what's wired client-side.
export default function AdminSocialLoginSettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--text-1)] mb-1">Social Login</h1>
      <p className="text-xs text-[var(--text-3)] mb-6">
        Provider credentials and redirect URLs are configured in the Supabase dashboard (Authentication → Providers), not here — this page just confirms what's wired into the sign-in page.
      </p>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-[var(--text-1)]">Google</p>
            <p className="text-xs text-[var(--text-3)] mt-0.5">Wired in hub/src/app/auth/login/page.tsx via supabase.auth.signInWithOAuth</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--green)]"><CheckCircle2 size={14} /> Wired</span>
        </div>
      </div>
    </div>
  )
}
