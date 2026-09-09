import { NextResponse, type NextRequest } from "next/server";

import { bearerToken, dataApiForToken } from "@/lib/neon-server";
import { validateContactUpdate } from "@/lib/validation";

/**
 * /api/contacts/[id] -- edit and delete a single contact.
 *
 * In Next 16 `params` is a Promise and must be awaited.
 *
 * Note what is NOT here: an ownership check. There is no
 * `if (contact.user_id !== me) return 403`, because that check would be
 * redundant and, worse, would imply the security lives in this file. The
 * UPDATE and DELETE policies restrict the statement to rows the caller owns,
 * so a request for someone else's id simply matches zero rows and comes back
 * as a 404. The database is the enforcement point.
 */

const SELECT_COLUMNS =
  "id,user_id,name,company,role,where_met,notes,priority,created_at,updated_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unauthorized() {
  return NextResponse.json(
    { error: "You must be signed in to do that." },
    { status: 401 },
  );
}

function notFound() {
  return NextResponse.json(
    { error: "That contact does not exist, or is not yours." },
    { status: 404 },
  );
}

// ---------------------------------------------------------------------------
// PATCH /api/contacts/[id]
// ---------------------------------------------------------------------------
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const validation = validateContactUpdate(body);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", fieldErrors: validation.errors },
      { status: 400 },
    );
  }

  // Belt and braces: the schema already drops unknown keys, so user_id can
  // never reach the update. Deleting it explicitly documents the intent, and
  // the UPDATE policy's WITH CHECK would reject the row anyway.
  const patch = { ...validation.data } as Record<string, unknown>;
  delete patch.user_id;
  delete patch.id;

  try {
    const neon = dataApiForToken(token);
    const { data, error } = await neon
      .from("contacts")
      .update(patch)
      .eq("id", id)
      .select(SELECT_COLUMNS);

    if (error) {
      console.error("[contacts:update]", error);
      const isCheckViolation = error.code === "23514";
      return NextResponse.json(
        {
          error: isCheckViolation
            ? "That contact is not valid. Check the name and priority."
            : "Could not update this contact. Please try again.",
        },
        { status: isCheckViolation ? 400 : 502 },
      );
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    // Zero rows means RLS filtered it out: either the id does not exist or it
    // belongs to someone else. Both answer the same way, so the response does
    // not confirm whether another user's contact exists.
    if (rows.length === 0) return notFound();

    return NextResponse.json({ contact: rows[0] });
  } catch (cause) {
    console.error("[contacts:update]", cause);
    return NextResponse.json(
      { error: "Could not update this contact. Please try again." },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/contacts/[id]
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = bearerToken(request);
  if (!token) return unauthorized();

  const { id } = await params;
  if (!UUID_RE.test(id)) return notFound();

  try {
    const neon = dataApiForToken(token);
    const { data, error } = await neon
      .from("contacts")
      .delete()
      .eq("id", id)
      .select("id");

    if (error) {
      console.error("[contacts:delete]", error);
      return NextResponse.json(
        { error: "Could not delete this contact. Please try again." },
        { status: 502 },
      );
    }

    const rows = Array.isArray(data) ? data : data ? [data] : [];
    if (rows.length === 0) return notFound();

    return NextResponse.json({ id });
  } catch (cause) {
    console.error("[contacts:delete]", cause);
    return NextResponse.json(
      { error: "Could not delete this contact. Please try again." },
      { status: 500 },
    );
  }
}
