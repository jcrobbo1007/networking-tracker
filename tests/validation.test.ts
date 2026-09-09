import { describe, expect, it } from "vitest";
import {
  isPriority,
  isSortField,
  validateContactInput,
  validateContactUpdate,
} from "../src/lib/validation";

/**
 * These tests cover the rules the assignment calls out explicitly:
 *   "Empty names and invalid priority values fail with a clear error message"
 *
 * They exercise the same module the API route handlers use, so a passing run
 * is evidence about the enforcing code path, not a parallel copy of it.
 */

const valid = {
  name: "Priya Raman",
  company: "Sequoia",
  role: "Partner",
  where_met: "Haas AI x Energy mixer",
  notes: "Intro'd by Greg. Follow up re: grid-scale storage thesis.",
  priority: "high",
};

describe("validateContactInput -- name", () => {
  it("accepts a fully populated contact", () => {
    const result = validateContactInput(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Priya Raman");
      expect(result.data.priority).toBe("high");
    }
  });

  it("rejects an empty name with a clear message", () => {
    const result = validateContactInput({ ...valid, name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Name is required");
  });

  it("rejects a whitespace-only name (not just a zero-length string)", () => {
    const result = validateContactInput({ ...valid, name: "   \t  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Name is required");
  });

  it("rejects a missing name", () => {
    const withoutName: Record<string, unknown> = { ...valid };
    delete withoutName.name;
    const result = validateContactInput(withoutName);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeTruthy();
  });

  it("rejects a name over 200 characters", () => {
    const result = validateContactInput({ ...valid, name: "a".repeat(201) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toMatch(/200 characters/);
  });

  it("trims surrounding whitespace from an otherwise valid name", () => {
    const result = validateContactInput({ ...valid, name: "  Dana Cole  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.name).toBe("Dana Cole");
  });
});

describe("validateContactInput -- priority", () => {
  it.each(["high", "medium", "low"])("accepts %s", (priority) => {
    const result = validateContactInput({ ...valid, priority });
    expect(result.ok).toBe(true);
  });

  // "urgent" is an unlisted word, "HIGH" is the right word in the wrong case,
  // and the rest are types the client should never be able to smuggle through.
  it.each(["urgent", "HIGH", "", 1, null])("rejects %o", (priority) => {
    const result = validateContactInput({ ...valid, priority });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.priority).toBe(
        "Priority must be one of: high, medium, low",
      );
    }
  });

  it("rejects a missing priority", () => {
    const withoutPriority: Record<string, unknown> = { ...valid };
    delete withoutPriority.priority;
    const result = validateContactInput(withoutPriority);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priority).toBeTruthy();
  });
});

describe("validateContactInput -- optional fields", () => {
  it("accepts a contact with only the required fields", () => {
    const result = validateContactInput({ name: "Sam Oyelaran", priority: "low" });
    expect(result.ok).toBe(true);
  });

  it("normalises blank optional fields to null rather than empty strings", () => {
    const result = validateContactInput({
      name: "Sam Oyelaran",
      priority: "low",
      company: "",
      role: "   ",
      where_met: "",
      notes: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.company).toBeNull();
      expect(result.data.role).toBeNull();
      expect(result.data.where_met).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });

  it("rejects notes longer than 2000 characters", () => {
    const result = validateContactInput({ ...valid, notes: "x".repeat(2001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.notes).toMatch(/2000 characters/);
  });
});

describe("validateContactInput -- ownership cannot be set by the client", () => {
  it("strips user_id from the payload instead of trusting it", () => {
    const result = validateContactInput({ ...valid, user_id: "some-other-user" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).not.toHaveProperty("user_id");
    }
  });

  it("strips a client-supplied id", () => {
    const result = validateContactInput({ ...valid, id: "00000000-0000-0000-0000-000000000000" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).not.toHaveProperty("id");
  });
});

describe("validateContactUpdate", () => {
  it("accepts a single-field edit", () => {
    const result = validateContactUpdate({ priority: "medium" });
    expect(result.ok).toBe(true);
  });

  it("still rejects an invalid priority on a partial update", () => {
    const result = validateContactUpdate({ priority: "someday" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priority).toBeTruthy();
  });

  it("still rejects a blanked-out name on a partial update", () => {
    const result = validateContactUpdate({ name: "  " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBe("Name is required");
  });

  it("rejects an empty patch", () => {
    const result = validateContactUpdate({});
    expect(result.ok).toBe(false);
  });
});

describe("sort and filter allow-lists", () => {
  it("accepts known sort fields", () => {
    expect(isSortField("name")).toBe(true);
    expect(isSortField("priority")).toBe(true);
  });

  it("rejects an unknown sort field, so it can never reach the query string", () => {
    expect(isSortField("user_id")).toBe(false);
    expect(isSortField("name; drop table contacts")).toBe(false);
  });

  it("guards priority filter values", () => {
    expect(isPriority("high")).toBe(true);
    expect(isPriority("everything")).toBe(false);
  });
});
