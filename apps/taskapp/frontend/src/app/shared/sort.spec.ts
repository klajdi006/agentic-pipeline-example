import { stableSortBy } from './sort';

describe('stableSortBy', () => {
  it('orders ascending by rank', () => {
    const out = stableSortBy([{ n: 3 }, { n: 1 }, { n: 2 }], (x) => x.n);
    expect(out.map((x) => x.n)).toEqual([1, 2, 3]);
  });

  it('keeps original order for equal ranks (stable)', () => {
    const out = stableSortBy(
      [{ id: 'a', r: 0 }, { id: 'b', r: 0 }, { id: 'c', r: 0 }],
      (x) => x.r,
    );
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [{ n: 2 }, { n: 1 }];
    stableSortBy(input, (x) => x.n);
    expect(input.map((x) => x.n)).toEqual([2, 1]);
  });
});
