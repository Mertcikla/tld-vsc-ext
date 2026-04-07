export type TreeSitterQueryTextResolver = (langId: string, queryName: string) => Promise<string | null>

export function createCachedTreeSitterQueryTextResolver(
  fetchQueryText: (langId: string, queryName: string) => Promise<string | null>,
): TreeSitterQueryTextResolver {
  const cache = new Map<string, Promise<string | null>>()

  return (langId: string, queryName: string) => {
    const cacheKey = `${langId}:${queryName}`
    const existing = cache.get(cacheKey)
    if (existing) return existing

    const pending = Promise.resolve(fetchQueryText(langId, queryName)).catch(() => null)
    cache.set(cacheKey, pending)
    return pending
  }
}