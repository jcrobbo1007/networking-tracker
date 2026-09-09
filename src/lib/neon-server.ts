import "server-only";

import { createClient } from "@neondatabase/neon-js";

/**
 * Server-side Data API client, scoped to one caller.
 *
 * The route handlers are trusted code, but they are deliberately NOT
 * privileged: they hold no service key and no Postgres connection string. They
 * act strictly on behalf of the caller by forwarding the caller's own JWT, so
 * every statement they issue is still filtered by the same RLS policies that
 * would apply if the browser had called the Data API itself.
 *
 * That means a bug in a route handler cannot leak another user's rows. The
 * handlers add validation; they do not add authority.
 */
export function dataApiForToken(token: string) {
  const url = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_NEON_DATA_API_URL");

  return createClient({
    dataApi: {
      url,
      // Consulted on every request; we already have the caller's token.
      getToken: async () => token,
    },
  });
}

/** Pull the bearer token off an incoming request, or null if absent/malformed. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;

  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}
