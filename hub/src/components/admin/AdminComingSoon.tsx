import { Construction } from 'lucide-react'

// For nav items that point at a feature with no backing data model yet
// (no table, no schema) — rather than fake a CRUD screen with nothing real
// behind it, this says so plainly and states what's actually missing.
export function AdminComingSoon({ title, missing }: { title: string; missing: string }) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-black text-white mb-6">{title}</h1>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <Construction size={28} className="mx-auto text-zinc-600 mb-3" />
        <p className="text-sm font-bold text-zinc-300 mb-1">Not built yet</p>
        <p className="text-xs text-zinc-500 max-w-md mx-auto">{missing}</p>
      </div>
    </div>
  )
}
