#!/usr/bin/env node
/**
 * Two-account privacy proof.
 *
 *   npm run test:privacy
 *
 * This script deliberately does NOT go through the Next.js API routes. It signs
 * two users in against Neon Auth and then talks straight to the public Data API
 * with each user's JWT -- exactly what an attacker with the public URLs and a
 * free account can do.
 *
 * That is the point. If the only thing stopping User B from reading User A's
 * contacts were an `if` statement in a route handler, this script would sail
 * through it. Every check below therefore tests Row Level Security itself.
 *
 * Set TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD (and _B_) to reuse fixed
 * accounts; otherwise throwaway accounts are created.
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";

// `neon deploy` writes .env.local; a bare `import "dotenv/config"` only reads
// .env. Load both, .env.local first.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: [join(repoRoot, ".env.local"), join(repoRoot, ".env")], quiet: true });

const AUTH_URL = process.env.NEXT_PUBLIC_NEON_AUTH_URL;
const DATA_URL = process.env.NEXT_PUBLIC_NEON_DATA_API_URL;

if (!AUTH_URL || !DATA_URL) {
  console.error(
    "\nMissing NEXT_PUBLIC_NEON_AUTH_URL or NEXT_PUBLIC_NEON_DATA_API_URL.\n" +
      "Copy .env.example to .env.local and fill them in (or run `neon deploy`).\n",
  );
  process.exit(1);
}

const trim = (u) => u.replace(/\/$/, "");
const authUrl = trim(AUTH_URL);
const dataUrl = trim(DATA_URL);

let passed = 0;
let failed = 0;

function check(description, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${description}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${description}${detail ? `\n        ${detail}` : ""}`);
  }
}

// --- auth -------------------------------------------------------------------

// Better Auth enforces a trusted-origin check on its endpoints and rejects a
// request with no Origin header (403 MISSING_OR_NULL_ORIGIN). A browser sets
// this automatically; Node's fetch does not, so send it explicitly. It must be
// an origin Neon Auth trusts: localhost (see `neon neon-auth domain
// allow-localhost enable`) or a domain added with `neon neon-auth domain add`.
const ORIGIN = process.env.PRIVACY_TEST_ORIGIN ?? "http://localhost:3000";

async function authPost(path, body) {
  const response = await fetch(`${authUrl}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  // Better Auth issues the session as a Set-Cookie, and /token authenticates by
  // that cookie rather than by a bearer session token.
  const cookies = (response.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  return { status: response.status, body: json, cookies };
}

async function signIn(label, email, password, name) {
  // Sign up first; an existing account just comes back as an error we ignore.
  await authPost("sign-up/email", { email, password, name });

  const result = await authPost("sign-in/email", { email, password });
  if (result.status >= 400) {
    throw new Error(
      `Could not sign in ${label} (${email}): ${result.status} ${JSON.stringify(result.body)}`,
    );
  }

  const sessionToken = result.body?.token ?? result.body?.session?.token;
  const userId = result.body?.user?.id;
  if (!sessionToken || !userId) {
    throw new Error(
      `Signed in ${label} but found no token/user id in the response: ${JSON.stringify(result.body)}`,
    );
  }

  // The session token is NOT what Postgres verifies -- it is an opaque string,
  // not a JWT. Exchange the session for a short-lived JWT at Better Auth's
  // /token endpoint, whose `sub` claim is the user id; that is what the Data
  // API validates and what SQL reads back as auth.user_id(). This mirrors
  // `auth.token()` in src/lib/neon-client.ts. /token authenticates by the
  // session cookie, so forward it rather than sending a bearer token.
  if (!result.cookies) {
    throw new Error(`Signed in ${label} but got no session cookie back.`);
  }
  const jwtResponse = await fetch(`${authUrl}/token`, {
    headers: { Cookie: result.cookies, Origin: ORIGIN },
  });
  const jwtText = await jwtResponse.text();
  let jwtBody;
  try {
    jwtBody = JSON.parse(jwtText);
  } catch {
    jwtBody = { raw: jwtText };
  }
  const token = jwtBody?.token ?? jwtBody?.data?.token;
  if (!token) {
    throw new Error(
      `Could not get a JWT for ${label}: ${jwtResponse.status} ${JSON.stringify(jwtBody)}`,
    );
  }

  console.log(`  ${label}: ${email}  (user id ${userId})`);
  return { email, token, userId };
}

// --- data api ---------------------------------------------------------------

async function dataApi(user, path, init = {}) {
  const response = await fetch(`${dataUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      Prefer: "return=representation",
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const rows = (result) => (Array.isArray(result.body) ? result.body : []);

// --- the test ---------------------------------------------------------------

const run = randomUUID().slice(0, 8);
const userA = {
  email: process.env.TEST_USER_A_EMAIL ?? `rls-a-${run}@example.com`,
  password: process.env.TEST_USER_A_PASSWORD ?? `Test-A-${run}!`,
};
const userB = {
  email: process.env.TEST_USER_B_EMAIL ?? `rls-b-${run}@example.com`,
  password: process.env.TEST_USER_B_PASSWORD ?? `Test-B-${run}!`,
};

console.log("\nTwo-account privacy test");
console.log(`Data API: ${dataUrl}\n`);
console.log("Signing in two accounts:");

const A = await signIn("User A", userA.email, userA.password, "User A");
const B = await signIn("User B", userB.email, userB.password, "User B");

console.log("\nUser A creates a private contact:");
const created = await dataApi(A, "/contacts", {
  method: "POST",
  // Note: no user_id is sent. Postgres fills it from auth.user_id().
  body: JSON.stringify({
    name: `A's private contact ${run}`,
    company: "Confidential Ltd",
    priority: "high",
  }),
});

const secret = rows(created)[0];
if (!secret) {
  console.error(
    `\nCould not create the fixture row: ${created.status} ${JSON.stringify(created.body)}\n` +
      "Has the migration been applied? Run `npm run db:migrate`.\n",
  );
  process.exit(1);
}
console.log(`  created ${secret.id}`);
check(
  "user_id defaulted to User A's id without the client sending it",
  secret.user_id === A.userId,
  `expected ${A.userId}, got ${secret.user_id}`,
);

console.log("\nUser A can reach their own row:");
{
  const result = await dataApi(A, `/contacts?id=eq.${secret.id}`);
  check("SELECT returns the row for its owner", rows(result).length === 1);
}

console.log("\nUser B attacks User A's row:");
{
  const list = await dataApi(B, "/contacts");
  check(
    "B's full contact list does not contain A's row",
    !rows(list).some((r) => r.id === secret.id),
    `B saw ${rows(list).length} row(s)`,
  );
}
{
  const result = await dataApi(B, `/contacts?id=eq.${secret.id}`);
  check(
    "SELECT by A's exact row id returns nothing for B",
    rows(result).length === 0,
    `got ${JSON.stringify(result.body)}`,
  );
}
{
  const result = await dataApi(B, `/contacts?id=eq.${secret.id}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "OWNED BY B" }),
  });
  check(
    "UPDATE of A's row changes nothing for B",
    rows(result).length === 0,
    `got ${JSON.stringify(result.body)}`,
  );
}
{
  const result = await dataApi(B, `/contacts?id=eq.${secret.id}`, {
    method: "DELETE",
  });
  check(
    "DELETE of A's row removes nothing for B",
    rows(result).length === 0,
    `got ${JSON.stringify(result.body)}`,
  );
}
{
  // The WITH CHECK clause on the INSERT policy.
  const result = await dataApi(B, "/contacts", {
    method: "POST",
    body: JSON.stringify({
      name: "Planted in A's account",
      priority: "low",
      user_id: A.userId,
    }),
  });
  check(
    "INSERT with user_id spoofed to A is rejected",
    result.status >= 400 || rows(result).length === 0,
    `got ${result.status} ${JSON.stringify(result.body)}`,
  );
}

console.log("\nUser A cannot give a row away:");
{
  // The WITH CHECK clause on the UPDATE policy.
  const result = await dataApi(A, `/contacts?id=eq.${secret.id}`, {
    method: "PATCH",
    body: JSON.stringify({ user_id: B.userId }),
  });
  check(
    "UPDATE that reassigns user_id to B is rejected",
    result.status >= 400 || rows(result).length === 0,
    `got ${result.status} ${JSON.stringify(result.body)}`,
  );

  const after = await dataApi(A, `/contacts?id=eq.${secret.id}`);
  check(
    "the row still belongs to A afterwards",
    rows(after)[0]?.user_id === A.userId,
  );
}

console.log("\nSigned-out requests:");
{
  const result = await dataApi(null, "/contacts");
  check(
    "SELECT with no token returns no rows",
    result.status >= 400 || rows(result).length === 0,
    `got ${result.status} ${JSON.stringify(result.body)}`,
  );
}

console.log("\nDatabase-level validation (independent of the API routes):");
{
  const blank = await dataApi(A, "/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "   ", priority: "high" }),
  });
  check(
    "blank name rejected by the CHECK constraint",
    blank.status >= 400,
    `got ${blank.status} ${JSON.stringify(blank.body)}`,
  );

  const badPriority = await dataApi(A, "/contacts", {
    method: "POST",
    body: JSON.stringify({ name: "Valid name", priority: "urgent" }),
  });
  check(
    "invalid priority rejected by the CHECK constraint",
    badPriority.status >= 400,
    `got ${badPriority.status} ${JSON.stringify(badPriority.body)}`,
  );
}

// --- cleanup ----------------------------------------------------------------
await dataApi(A, `/contacts?id=eq.${secret.id}`, { method: "DELETE" });

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
