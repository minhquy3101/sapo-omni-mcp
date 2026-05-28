import { describe, it, expect } from "vitest";
import { ISO8601_DATE } from "./iso8601.js";

describe("ISO8601_DATE", () => {
  it("accepts a valid UTC datetime string", () => {
    expect(ISO8601_DATE.parse("2026-05-28T07:00:00Z")).toBe("2026-05-28T07:00:00Z");
  });

  it("rejects a +07:00 timezone offset string", () => {
    expect(() => ISO8601_DATE.parse("2026-05-28T14:00:00+07:00")).toThrow(
      "Date must be ISO 8601 UTC format",
    );
  });

  it("rejects a date-only string (no time component)", () => {
    expect(() => ISO8601_DATE.parse("2026-05-28")).toThrow("Date must be ISO 8601 UTC format");
  });

  it("rejects an empty string", () => {
    expect(() => ISO8601_DATE.parse("")).toThrow();
  });
});
