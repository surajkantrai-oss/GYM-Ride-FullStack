import { pageMeta } from './pagination.dto';

describe('pageMeta', () => {
  it('reports usable navigation flags', () => {
    expect(pageMeta(2, 20, 61)).toEqual({
      page: 2,
      limit: 20,
      total: 61,
      totalPages: 4,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(pageMeta(1, 20, 0)).toEqual(
      expect.objectContaining({
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
    );
  });
});
