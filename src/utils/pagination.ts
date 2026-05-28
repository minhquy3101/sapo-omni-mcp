export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export function normalizePage<T>(
  items: T[],
  pagination: { page: number; limit: number },
  total: number,
): PaginatedResponse<T> {
  return { items, page: pagination.page, limit: pagination.limit, total };
}

export async function fetchAllPages<T>(
  fetcher: (page: number, limit: number) => Promise<T[]>,
  limit = 250,
): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  while (true) {
    const items = await fetcher(page, limit);
    all.push(...items);
    if (items.length < limit) break;
    page++;
  }
  return all;
}
