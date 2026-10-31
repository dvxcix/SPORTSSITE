/** Remove retired sport breakdowns without changing overall historical rankings. */
export function filterLeaderboardSports<T extends { bySport: Record<string, unknown> }>(users: T[], allSports: string[], mlbAccess: boolean): { users: T[]; allSports: string[] } {
  if (mlbAccess) return { users, allSports }
  return {
    users: users.map(user => ({ ...user, bySport: Object.fromEntries(Object.entries(user.bySport).filter(([sport]) => sport.toUpperCase() !== 'MLB')) })),
    allSports: allSports.filter(sport => sport.toUpperCase() !== 'MLB'),
  }
}
