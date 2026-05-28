import { describe, it, expect } from "vitest";
import { isDryRun, buildDryRunResult } from "./dry-run.js";

describe("isDryRun", () => {
  it("returns true when dry_run is true", () => {
    expect(isDryRun({ dry_run: true })).toBe(true);
  });

  it("returns false when dry_run is false", () => {
    expect(isDryRun({ dry_run: false })).toBe(false);
  });

  it("returns true when dry_run is undefined (safe-by-default)", () => {
    expect(isDryRun({})).toBe(true);
  });
});

describe("buildDryRunResult", () => {
  it("returns valid MCP tool result with dry_run: true in body", () => {
    const result = buildDryRunResult({
      action: "Delete product #123",
      endpoint: "DELETE /admin/products/123.json",
      would_affect: { product_name: "Áo thun đen", variant_count: 3 },
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.dry_run).toBe(true);
    expect(parsed.action).toBe("Delete product #123");
    expect(parsed.endpoint).toBe("DELETE /admin/products/123.json");
    expect((parsed.would_affect as Record<string, unknown>).product_name).toBe("Áo thun đen");
  });
});
