/** Select within the displayed team, using the active category's table MM. */
export function teamMmHighlights<T extends { name: string; mm: number | null }>(rows: T[]) {
  const ranked = rows.filter(row => row.mm != null && Number.isFinite(row.mm))
  const advertised = ranked.filter(row => row.mm! < 0).sort((a, b) => a.mm! - b.mm! || a.name.localeCompare(b.name))[0]
  const hidden = ranked.filter(row => row.mm! > 0).sort((a, b) => b.mm! - a.mm! || a.name.localeCompare(b.name))[0]
  return { advertised, hidden }
}
