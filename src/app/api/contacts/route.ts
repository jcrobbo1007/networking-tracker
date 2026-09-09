import { NextResponse, type NextRequest } from "next/server";

import { bearerToken, dataApiForToken } from "@/lib/neon-server";
import {
  isPriority,
  isSortDirection,
  isSortField,
  validateContactInput,
} from "@/lib/validation";

/**
 * /api/contacts -- the backend for the contacts list.
 *
 * Route handlers are not cached in Next 16, so every call is a live read.
 *
 * Auth note: Proxy (src/proxy.ts equivalent) is not a security boundary for
 * API routes, so each handler checks for a token itself rather than assuming
 * an upstream check ran.
 */

const SELECT_COLUMNS =
  "id,user_id,name,company,role,where_met,notes,priority,created_at,updated_at";

function unauthorized() {
  return NextResponse.json(
    { error: "You must be signed in to do that." },
    { status: 401 },
  );
}

// ---------------------------------------------------------------------------
// GET /api/contacts?sort=name&direction=asc&priority=high&q=sequoia
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const params = request.nextUrl.searchParams;

  // Sort and filter inputs are checked against allow-lists before they are
  // allowed anywhere near a query, so an attacker cannot order by a column
  // they should not see or inject PostgREST operators.
  const sortParam = params.get("sort");
  const directionParam = params.get("direction");
  const priorityParam = params.get("priority");
  const search = params.get("q")?.trim() ?? "";

  const sort = isSortField(sortParam) ? sortParam : "created_at";
  const direction = isSortDirection(directionParam) ? directionParam : "desc";

  try {
    const neon = dataApiForToken(token);
    let query = neon.from("contacts").select(SELECT_COLUMNS);

    if (isPriority(priorityParam)) {
      query = query.eq("priority", priorityParam);
    }

    if (search.length > 0) {
      // Escape PostgREST's delimiters so a search term stays a search term.
      const safe = search.replace(/[(),*\\]/g, "");
      if (safe.length > 0) {
        query = query.or(
          `name.ilike.*${safe}*,company.ilike.*${safe}*,role.ilike.*${safe}*,where_met.ilike.*${safe}*,notes.ilike.*${safe}*`,
        );
      }
    }

    // Priority is stored as text, so alphabetical ordering would give
    // high < low < medium. Sort by meaning instead.
    if (sort === "priority") {
      query = query
        .order("priority", { ascending: direction === "desc" })
        .order("created_at", { ascending: false });
    } else {
      query = query.order(sort, { ascending: direction === "asc" });
    }

    const { data, error } = await query;

    if (error) {
      console.error("[contacts:list]", error);
      return NextResponse.json(
        { error: "Could not load your contacts. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ contacts: data ?? [] });
  } catch (cause) {
    console.error("[contacts:list]", cause);
    return NextResponse.json(
      { error: "Could not load your contacts. Please try again." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/contacts
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  // Trusted server-side validation. The client runs the same schema for fast
  // feedback, but this is the copy that decides.
  const validation = validateContactInput(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validation.errors },
      { status: 400 },
    );
  }

  try {
    const neon = dataApiForToken(token);

    // user_id is deliberately absent from the insert. Postgres fills it from
    // auth.user_id(), and the INSERT policy's WITH CHECK rejects the row if it
    // does not match the caller. Ownership is never client-controlled.
    const { data, error } = await neon
      .from("contacts")
      .insert(validation.data)
      .select(SELECT_COLUMNS);

    if (error) {
      console.error("[contacts:create]", error);
      // A CHECK constraint violation means the database caught something the
      // schema above should have; surface it as a validation failure.
      const isCheckViolation = error.code === "23514";
      return NextResponse.json(
        {
          error: isCheckViolation
            ? "That contact is not valid. Check the name and priority."
            : "Could not save this contact. Please try again.",
        },
        { status: isCheckViolation ? 400 : 502 },
      );
    }

    const created = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ contact: created }, { status: 201 });
  } catch (cause) {
    console.error("[contacts:create]", cause);
    return NextResponse.json(
      { error: "Could not save this contact. Please try again." },
      { status: 500 },
    );
  }
}
