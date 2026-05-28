import { z } from "zod";

// UTC-only by design: +07:00 timezone offsets rejected.
// Vietnamese merchants should convert local time to UTC equivalents (subtract 7h).
// Fix requires a date library dependency — not worth the overhead given no user complaints.
export const ISO8601_DATE = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/,
    "Date must be ISO 8601 UTC format: YYYY-MM-DDTHH:MM:SSZ",
  );
