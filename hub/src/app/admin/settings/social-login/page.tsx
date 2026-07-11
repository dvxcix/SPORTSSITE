import { CheckCircle2 } from 'lucide-react'

// Status-only page — provider credentials/config live in the Supabase
// dashboard (Authentication → Providers), not in this app's DB, so there's
// nothing here to edit, only to confirm what's wired client-side.
export default function AdminSocialLoginSettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-white mb-1">Social Login</h1>
      <p className="text-xs text-zinc-500 mb-6">
        Provider credentials and redirect URLs are configured in the Supabase dashboard (Authentication → Providers), not here — this page just confirms what's wired into the sign-in page.
      </p>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-white">Google</p>
            <p className="text-xs text-zinc-500 mt-0.5">Wired in hub/src/app/auth/login/page.tsx via supabase.auth.signInWithOAuth</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-bold text-green-400"><CheckCircle2 size={14} /> Wired</span>
        </div>
      </div>
    </div>
  )
}
