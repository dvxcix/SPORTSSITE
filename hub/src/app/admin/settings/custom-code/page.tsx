import { CustomCodeEditor } from '@/components/admin/CustomCodeEditor'

export default function CustomCodePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-black text-white mb-2">Custom CSS / JS</h1>
      <p className="text-sm text-zinc-500 mb-6">Injected into every page — use for global style overrides or tracking scripts.</p>
      <CustomCodeEditor />
    </div>
  )
}
