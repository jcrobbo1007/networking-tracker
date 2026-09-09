"use client";

import { createClient } from "@neondatabase/neon-js";
import { BetterAuthReactAdapter } from "@neondatabase/neon-js/auth/react/adapters";

/**
 * Browser-side Neon client, built with the two-URL object form.
 *
 * Both URLs are public by design:
 *   - the Auth URL is the endpoint the browser posts credentials to
 *   - the Data API URL is a PostgREST endpoint that will only ever return rows
 *     the caller's JWT is allowed to see
 *
 * Neither is a secret, and neither is sufficient to read anyone's data. The
 * security boundary is Row Level Security in Postgres, not URL secrecy. The
 * Postgres connection string is never referenced anywhere in this directory.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in ` +
        `(\`neon deploy\` writes these for you).`,
    );
  }
  return value;
}

export const neon = createClient({
  auth: {
    url: requireEnv(
      "NEXT_PUBLIC_NEON_AUTH_URL",
      process.env.NEXT_PUBLIC_NEON_AUTH_URL,
    ),
    // The React adapter exposes better-auth's hooks (useSession) alongside the
    // imperative methods, so components re-render when the session changes.
    adapter: BetterAuthReactAdapter(),
  },
  dataApi: {
    url: requireEnv(
      "NEXT_PUBLIC_NEON_DATA_API_URL",
      process.env.NEXT_PUBLIC_NEON_DATA_API_URL,
    ),
  },
});

/** better-auth React client: `useSession`, `signIn`, `signUp`, `signOut`. */
export const auth = neon.auth;

/**
 * The JWT for the current session, or null when signed out.
 *
 * Writes go through this app's own API routes so they can be validated in
 * trusted server code; the route needs the caller's token to talk to the Data
 * API as that user, so the browser forwards it in an Authorization header.
 */
export async function getAccessToken(): Promise<string | null> {
  // `token()` is the Better Auth JWT endpoint (/token). It returns a short-lived
  // JWT whose `sub` claim is what Postgres reads back as auth.user_id().
  const result = await auth.token();
  return "data" in result ? (result.data?.token ?? null) : null;
}
