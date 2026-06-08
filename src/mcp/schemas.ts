import { z } from "zod";

/**
 * LSP `Position` (zero-based line + UTF-16 character offset).
 * See spec §9.1.
 */
export const PositionSchema = z.object({
  line: z.number().int().nonnegative(),
  character: z.number().int().nonnegative(),
});

/**
 * LSP `Range` built from two `Position` values.
 * See spec §9.2.
 */
export const RangeSchema = z.object({
  start: PositionSchema,
  end: PositionSchema,
});
