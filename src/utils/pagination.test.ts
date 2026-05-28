import { describe, it, expect, vi } from "vitest";
import { normalizePage, fetchAllPages } from "./pagination.js";

describe("normalizePage", () => {
  it("returns correct PaginatedResponse shape", () => {
    const items = [{ id: 1 }, { id: 2 }];
    const result = normalizePage(items, { page: 1, limit: 20 }, 100);
    expect(result).toEqual({ items, page: 1, limit: 20, total: 100 });
  });

  it("preserves generic type — TypeScript compile-time check", () => {
    const result = normalizePage(["a", "b"], { page: 2, limit: 10 }, 50);
    expect(result.items[0]).toBe("a");
    expect(result.page).toBe(2);
    expect(result.total).toBe(50);
  });
});

describe("fetchAllPages", () => {
  it("returns all items across multiple pages", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 3 }]);

    const result = await fetchAllPages(fetcher, 2);
    expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stops fetching when page returns fewer items than limit", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce([{ id: 1 }]);
    const result = await fetchAllPages(fetcher, 250);
    expect(result).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("handles empty first page", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce([]);
    const result = await fetchAllPages(fetcher, 250);
    expect(result).toEqual([]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
