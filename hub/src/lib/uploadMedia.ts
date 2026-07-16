// Uploads a file to the 'media' bucket via /api/upload rather than calling
// supabase.storage directly from the browser — Storage is currently
// rejecting valid sessions at its RLS layer (a platform-side JWT
// verification issue), so the actual write happens server-side instead.
export async function uploadMedia(file: File, kind: string): Promise<{ publicUrl: string } | { error: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)

  let res: Response
  try {
    res = await fetch('/api/upload', { method: 'POST', body: form })
  } catch {
    return { error: 'Upload failed — please check your connection and try again.' }
  }

  const json = await res.json().catch(() => ({}))
  if (!res.ok) return { error: json.error || 'Upload failed — please try again.' }
  return { publicUrl: json.publicUrl }
}
