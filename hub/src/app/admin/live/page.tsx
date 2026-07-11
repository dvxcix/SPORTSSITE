import { AdminComingSoon } from '@/components/admin/AdminComingSoon'

export default function AdminLivePage() {
  return (
    <AdminComingSoon
      title="Live Streaming"
      missing="No live-stream table or streaming integration exists yet (no RTMP/HLS ingest, no channel table). This is a real feature build, not a missing admin screen."
    />
  )
}
