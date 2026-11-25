import palettes from './sportsbookSlipPalettes.json'

const aliases: Record<string, string> = {
  fd: 'fanduel', dk: 'draftkings', mgm: 'betmgm', cz: 'caesars', williamhillus: 'caesars', williamhill: 'caesars',
  fan: 'fanatics', br: 'betrivers', ballys: 'ballybet', bally: 'ballybet', parx: 'betparx',
  kal: 'kalshi', poly: 'polymarket', pm: 'polymarket',
}

export function normalizeVendor(value: string) {
  const key = (value || '').toLowerCase().replace(/[^a-z]/g, '')
  return Object.hasOwn(aliases, key) ? aliases[key] : key
}

export function sportsbookSlipPalette(value: string | null | undefined): readonly string[] | undefined {
  const key = normalizeVendor(value ?? '')
  return Object.hasOwn(palettes, key) ? palettes[key as keyof typeof palettes] : undefined
}

export function pickSlipBook(pickBook: string | null | undefined, postBook: string | null | undefined) {
  return pickBook?.trim() || postBook?.trim() || null
}

export function darkSportsbookSlipGradient(book: string | null, surface: string): string {
  const palette = sportsbookSlipPalette(book)
  if (!palette) return surface
  const [primary, secondary] = palette
  return `linear-gradient(128deg, ${primary}59 0%, ${secondary}38 67%, ${surface} 100%)`
}
