import { SkeletonBlock } from '@/components/ui/feedback-state'

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="space-y-2"><SkeletonBlock className="h-7 w-52" /><SkeletonBlock className="w-80 max-w-full" /></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} className="h-32" />)}</div>
      <div className="grid gap-5 xl:grid-cols-2"><SkeletonBlock className="h-80" /><SkeletonBlock className="h-80" /></div>
    </div>
  )
}
