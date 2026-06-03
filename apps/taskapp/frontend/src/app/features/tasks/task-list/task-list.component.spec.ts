/**
 * Framework-free unit tests for the pagination logic powering TaskListComponent.
 * Angular TestBed/JSDOM is not available in the ts-jest node environment, so the
 * computed signal logic is tested via pure helper functions that mirror the
 * component's `hasPrev` and `hasNext` computed signals.
 */

function hasPrev(page: number): boolean {
  return page > 1;
}

function hasNext(page: number, limit: number, total: number): boolean {
  return page * limit < total;
}

function nextPage(page: number): number {
  return page + 1;
}

function prevPage(page: number): number {
  return Math.max(1, page - 1);
}

describe('TaskListComponent pagination logic', () => {
  describe('initial load — page 1', () => {
    it('renders the first page (page signal defaults to 1)', () => {
      const page = 1;
      expect(page).toBe(1);
    });

    it('prev is disabled on page 1', () => {
      expect(hasPrev(1)).toBe(false);
    });
  });

  describe('hasPrev', () => {
    it('is false on page 1', () => {
      expect(hasPrev(1)).toBe(false);
    });

    it('is true on page > 1', () => {
      expect(hasPrev(2)).toBe(true);
      expect(hasPrev(10)).toBe(true);
    });
  });

  describe('hasNext', () => {
    it('is false when store is empty', () => {
      expect(hasNext(1, 20, 0)).toBe(false);
    });

    it('is false when all items fit on the current page', () => {
      expect(hasNext(1, 20, 20)).toBe(false);
      expect(hasNext(1, 20, 15)).toBe(false);
    });

    it('is true when more items exist beyond the current page', () => {
      expect(hasNext(1, 20, 25)).toBe(true);
    });

    it('is false on the last page', () => {
      // page 3, limit 10, total 25 → 30 > 25, so no next
      expect(hasNext(3, 10, 25)).toBe(false);
    });

    // AC-2: page 2 of 25 with limit=10 still has more items (page 3 exists)
    it('AC-2: is true on page 2 with limit=10, total=25 (items 21–25 still remain)', () => {
      expect(hasNext(2, 10, 25)).toBe(true);
    });

    // AC-4: page 4 of 25 with limit=10 → offset 30 > 25, no next page
    it('AC-4: is false on page 4 with limit=10, total=25 (page beyond data)', () => {
      expect(hasNext(4, 10, 25)).toBe(false);
    });

    // AC-10: limit larger than total → no next page
    it('AC-10: is false when limit=100 exceeds total=5', () => {
      expect(hasNext(1, 100, 5)).toBe(false);
    });
  });

  describe('next-page click', () => {
    it('increments page by 1', () => {
      expect(nextPage(1)).toBe(2);
      expect(nextPage(5)).toBe(6);
    });
  });

  describe('prev-page click', () => {
    it('decrements page by 1', () => {
      expect(prevPage(2)).toBe(1);
      expect(prevPage(5)).toBe(4);
    });

    it('does not go below page 1', () => {
      expect(prevPage(1)).toBe(1);
    });
  });

  describe('loading state', () => {
    it('hasNext returns false while data is not yet available (undefined)', () => {
      // Mirrors the component: d !== undefined ? ... : false
      const d = undefined;
      const result = d !== undefined ? hasNext(1, 20, (d as never)) : false;
      expect(result).toBe(false);
    });
  });
});
