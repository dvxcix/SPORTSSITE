/** One entry per author; retain every story and its viewer start position. */
export function groupStories<T extends { id:string; author?: { id?:string; username?:string } | null }>(stories:T[]) {
  const authors = new Map<string,T[]>()
  for (const story of stories) {
    const key=story.author?.id ?? story.author?.username ?? `story:${story.id}`
    const group=authors.get(key)
    if(group)group.push(story)
    else authors.set(key,[story])
  }
  let start=0
  return [...authors.values()].map(items=>{const group={stories:items,start};start+=items.length;return group})
}
