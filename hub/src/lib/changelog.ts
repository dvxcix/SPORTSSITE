export interface ChangelogEntry {
  id: string
  title: string
  description: string
  how_to_use: string | null
  screenshot_urls: string[]
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}
