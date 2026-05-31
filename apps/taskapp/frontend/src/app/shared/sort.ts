/**
 * Stable sort by a numeric rank derived from each item. Lower rank comes first;
 * items with equal rank keep their original order. Pure + framework-free, so it's
 * unit-testable with ts-jest (no Angular TestBed needed) and reusable by components
 * that need to mirror a backend ordering on the client.
 */
export function stableSortBy<T>(items: readonly T[], rank: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}
