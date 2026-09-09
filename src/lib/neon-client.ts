"use client";

import * as React from "react";

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

const AUTH_URL = requireEnv(
  "NEXT_PUBLIC_NEON_AUTH_URL",
  process.env.NEXT_PUBLIC_NEON_AUTH_URL,
).replace(/\/$/, "");

export const neon = createClient({
  auth: {
    url: AUTH_URL,
    // The React adapter gives us better-auth's imperative methods. Sign-up,
    // sign-in and their error handling all work through it.
    adapter: BetterAuthReactAdapter(),
  },
  dataApi: {
    url: requireEnv(
      "NEXT_PUBLIC_NEON_DATA_API_URL",
      process.env.NEXT_PUBLIC_NEON_DATA_API_URL,
    ),
  },
});

/** better-auth client: `signIn`, `signUp`. */
export const auth = neon.auth;

// ---------------------------------------------------------------------------
// Session and token reads
//
// These deliberately bypass the client library and call Managed Better Auth's
// HTTP endpoints directly. That is not stylistic -- the library's own session
// reads do not work against this deployment, and the failure is silent:
//
//   1. Better Auth issues the session as a cookie on its own *.neon.tech
//      origin, which is cross-site relative to this app. The cookie is only
//      sent when the request sets `credentials: "include"`.
//   2. The library's session read does not, so GET /get-session answers 200
//      with the body `null`. Measured on the deployed app: 753 bytes and a
//      real user with credentials, 4 bytes ("null") without.
//   3. The app therefore concluded nobody was signed in. Signing in pushed to
//      /contacts, the gate saw no session and bounced back to /sign-in, and
//      round it went. The network showed 200s throughout, which is what made
//      it hard to see.
//   4. Passing `fetchOptions` to the adapter does not fix it: createClient
//      calls the adapter builder as `(url, fetchOptions)` and supplies its
//      own, discarding what the factory was given.
//
// One further constraint, found by measurement: Neon Auth accepts credentialed
// *simple* requests, but a credentialed request carrying an unexpected custom
// header fails its CORS preflight outright ("TypeError: Failed to fetch").
// So these requests send no custom headers. Do not add any.
// ---------------------------------------------------------------------------

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

async function readJson(path: string): Promise<unknown> {
  try {
    const response = await fetch(`${AUTH_URL}${path}`, {
      credentials: "include",
    });
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

/** The signed-in user, or null. */
export async function fetchSession(): Promise<SessionUser | null> {
  const body = (await readJson("/get-session")) as { user?: unknown } | null;
  const user = body?.user;
  if (!user || typeof user !== "object") return null;
  return typeof (user as { id?: unknown }).id === "string"
    ? (user as SessionUser)
    : null;
}

/**
 * The JWT for the current session, or null when signed out.
 *
 * `/token` is the Better Auth JWT endpoint. It returns a short-lived JWT whose
 * `sub` claim is what Postgres reads back as auth.user_id(). This is not the
 * session token: that one is opaque, and the Data API rejects it with
 * "Provided authentication token is not a valid JWT encoding".
 */
export async function getAccessToken(): Promise<string | null> {
  const body = (await readJson("/token")) as
    | { token?: unknown; data?: { token?: unknown } }
    | null;
  const token = body?.token ?? body?.data?.token;
  return typeof token === "string" && token.length > 0 ? token : null;
}

/** End the session server-side, so the cookie stops authenticating. */
export async function signOut(): Promise<void> {
  try {
    await fetch(`${AUTH_URL}/sign-out`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // Nothing useful to do here; the caller navigates to /sign-in regardless.
  }
}

export type SessionGate =
  | { settled: false; user: null }
  | { settled: true; user: SessionUser | null };

/**
 * Resolve who is signed in, and report when that answer is final.
 *
 * A gate must not redirect until the session lookup has actually resolved,
 * otherwise it bounces a signed-in user on first render.
 */
export function useSessionGate(): SessionGate {
  const [gate, setGate] = React.useState<SessionGate>({
    settled: false,
    user: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    fetchSession().then((user) => {
      if (!cancelled) setGate({ settled: true, user });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return gate;
}
