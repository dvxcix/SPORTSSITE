export interface SiteBanner {
  id: number
  message: string
  bg_color: string
  text_color: string
  is_active: boolean
  dismissible: boolean
  link_url: string | null
  link_label: string | null
  updated_at: string
}

export const BANNER_PRESETS = [
  { label: 'Maintenance', bg: '#facc15', text: '#422006' },
  { label: 'Beta / Launch', bg: '#22c55e', text: '#052e16' },
  { label: 'Info', bg: '#3b82f6', text: '#eff6ff' },
  { label: 'Urgent', bg: '#ef4444', text: '#450a0a' },
  { label: 'Promo', bg: '#a855f7', text: '#3b0764' },
] as const
