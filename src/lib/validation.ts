import { z } from "zod";

/**
 * The single source of truth for what a valid contact looks like.
 *
 * This module is deliberately free of React, Next and database imports so it
 * can be imported by:
 *   - the API route handlers (trusted server code -- the enforcing copy)
 *   - the client form (for immediate feedback only, never trusted)
 *   - the Vitest suite
 *
 * The database mirrors these rules as CHECK constraints (see
 * db/migrations/0001_contacts.sql), so validation holds even if a request
 * skips the API layer entirely.
 */

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Trim strings, and turn blank optional fields into null rather than "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const contactInputSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .trim()
    .min(1, "Name is required")
    .max(200, "Name must be 200 characters or fewer"),

  company: optionalText(200),
  role: optionalText(200),
  where_met: optionalText(200),
  notes: optionalText(2000),

  priority: z.enum(PRIORITIES, {
    error: "Priority must be one of: high, medium, low",
  }),
});

/** Every field optional, but any field that IS present must still be valid. */
export const contactUpdateSchema = contactInputSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: "No fields to update",
  });

export type ContactInput = z.infer<typeof contactInputSchema>;
export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export type Contact = ContactInput & {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
};

/** Field-keyed error messages, which is what the form wants to render. */
export type FieldErrors = Record<string, string>;

export function formatZodErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    // Keep the first error per field; it is the most specific one.
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: FieldErrors };

export function validateContactInput(input: unknown): ValidationResult<ContactInput> {
  const result = contactInputSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: formatZodErrors(result.error) };
}

export function validateContactUpdate(input: unknown): ValidationResult<ContactUpdate> {
  const result = contactUpdateSchema.safeParse(input);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, errors: formatZodErrors(result.error) };
}

// ---------------------------------------------------------------------------
// Sorting and filtering
// ---------------------------------------------------------------------------
// These values reach PostgREST as query parameters, so they are validated
// against an allow-list rather than interpolated from user input.

export const SORT_FIELDS = [
  "created_at",
  "name",
  "company",
  "priority",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export function isSortField(value: unknown): value is SortField {
  return typeof value === "string" && (SORT_FIELDS as readonly string[]).includes(value);
}

export function isSortDirection(value: unknown): value is SortDirection {
  return (
    typeof value === "string" && (SORT_DIRECTIONS as readonly string[]).includes(value)
  );
}

export function isPriority(value: unknown): value is Priority {
  return typeof value === "string" && (PRIORITIES as readonly string[]).includes(value);
}
