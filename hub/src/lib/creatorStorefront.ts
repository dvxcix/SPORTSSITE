export const CREATOR_SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'CFB', 'CBB', 'Soccer', 'MMA'] as const
export const CREATOR_TAGS = ['Player props', 'Game lines', 'Live research', 'Film study', 'Matchups', 'Data analysis', 'Fantasy', 'Injury news', 'Long-form research', 'Community picks']
export type CreatorStore = { creator_id: string; name: string; bio: string; logo_url: string | null; cover_url: string | null; sports: string[]; tags: string[]; access_mode: 'free' | 'paid'; setup_step: number; status: 'draft' | 'published'; community_id: string | null; product_id: string | null; featured: boolean; featured_rank: number; updated_at: string; has_draft?: boolean }
export type CreatorStoreDraft = Pick<CreatorStore, 'name' | 'bio' | 'logo_url' | 'cover_url' | 'sports' | 'tags' | 'access_mode' | 'setup_step' | 'product_id'>
export const STORE_COLUMNS = 'creator_id,name,bio,logo_url,cover_url,sports,tags,access_mode,setup_step,status,community_id,product_id,featured,featured_rank,updated_at'
export const STORE_OWNER_COLUMNS = `${STORE_COLUMNS},draft` as const
export function ownerStore(row: (CreatorStore & {draft?:CreatorStoreDraft|null})|null):CreatorStore|null { return row ? {...row,...row.draft,has_draft:!!row.draft} : null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function storeDraft(value: unknown): CreatorStoreDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid storefront.')
  const row = value as Record<string, unknown>
  if (Object.keys(row).some(key => !['name','bio','logo_url','cover_url','sports','tags','access_mode','setup_step','product_id','action'].includes(key))) throw new Error('Unsupported storefront field.')
  if (typeof row.name !== 'string' || row.name.trim().length > 80 || typeof row.bio !== 'string' || row.bio.trim().length > 1000) throw new Error('Use a name up to 80 characters and a bio up to 1,000 characters.')
  if (!Array.isArray(row.sports) || row.sports.length > 8 || row.sports.some(item => typeof item !== 'string' || !CREATOR_SPORTS.includes(item as typeof CREATOR_SPORTS[number]))) throw new Error('Choose valid sports.')
  if (!Array.isArray(row.tags) || row.tags.length > 8 || row.tags.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 30 || /[<>\u0000-\u001f]/.test(item))) throw new Error('Choose up to eight tags, each up to 30 characters.')
  if (!['free','paid'].includes(String(row.access_mode)) || typeof row.access_mode !== 'string' || !Number.isInteger(row.setup_step) || Number(row.setup_step) < 0 || Number(row.setup_step) > 4) throw new Error('Invalid setup step.')
  if (row.product_id !== null && (typeof row.product_id !== 'string' || !UUID.test(row.product_id))) throw new Error('Choose one of your memberships.')
  const image = (value: unknown) => {
    if (value === null || value === '') return null
    if (typeof value !== 'string' || value.length > 2048) throw new Error('Choose a valid image.')
    if (/^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(value)) return value
    try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.toString() } catch {}
    throw new Error('Images must use HTTPS.')
  }
  return { name: row.name.trim(), bio: row.bio.trim(), logo_url: image(row.logo_url), cover_url: image(row.cover_url), sports: [...new Set(row.sports as string[])], tags: [...new Set((row.tags as string[]).map(item => item.trim()))], access_mode: row.access_mode as 'free' | 'paid', setup_step: Number(row.setup_step), product_id: row.product_id as string | null }
}
export function storePublishIssue(store: Pick<CreatorStore, 'name'|'bio'|'sports'|'community_id'|'access_mode'|'product_id'>) {
  if (store.name.length < 2) return 'Give your store a name.'
  if (store.bio.length < 10) return 'Add a short introduction for your members.'
  if (!store.sports.length) return 'Choose at least one sport.'
  if (!store.community_id) return 'Create your member community before publishing.'
  if (store.access_mode === 'paid' && !store.product_id) return 'Finish your membership and payment setup.'
  return null
}

/** Community summaries have tighter limits than the full storefront bio. */
export function storeCommunityBrand(store:Pick<CreatorStore,'name'|'bio'>) {
  return { p_name:Array.from(store.name).slice(0,60).join(''),p_description:Array.from(store.bio).slice(0,280).join('')||null }
}
