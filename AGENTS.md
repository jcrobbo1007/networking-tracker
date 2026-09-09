# Context for coding agents

Read this before changing anything. It records what the project is, what has and
has not been verified, and the specific gotchas that cost time to discover.

## What this is

A class assignment (Berkeley/LBS, "From Zero to AI Agents", Assignment 1):
a secure per-user networking tracker. Each signed-in user keeps a private list
of contacts — name, company, role, where met, notes, priority — with create,
read, update, delete, sort and filter. Graded entirely from one public GitHub
repo whose README must let a grader verify every requirement.

`README.md` is the grading surface and the fuller document. This file is the
working context.

**Neon project:** `bitter-moon-70893420`, branch `production`.
**GitHub:** `jcrobbo1007/networking-tracker` (public).

## The organising idea

**Row Level Security, not application code, is the security boundary.**

The browser holds the public Auth and Data API URLs and could call the Data API
directly. That is safe because Postgres policies — keyed on the JWT's subject
claim, surfaced to SQL as `auth.user_id()` — decide which rows any request can
reach.

The Next.js route handlers are **trusted but not privileged**. They validate
input, but they hold no service key and no Postgres connection string; they
forward the *caller's own JWT* to the Data API. So a route handler that forgot
a `WHERE user_id = ...` still cannot read anyone else's rows. The blast radius
of an application bug is zero.

This is the design decision to defend, and the thing most likely to be asked
about in grading. Do not weaken it to make an error message go away.

## Schema and policies

`public.contacts`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | pk, `default gen_random_uuid()`; client-supplied ids are stripped |
| `user_id` | `text` | **`not null default auth.user_id()`** — ownership; never sent by the client. `text` not `uuid` because Better Auth ids are text |
| `name` | `text` | `not null`, CHECK `length(btrim(name)) > 0` (so `"   "` fails), CHECK `<= 200` |
| `company`, `role`, `where_met`, `notes` | `text` | nullable |
| `priority` | `text` | `not null default 'medium'`, CHECK in `('high','medium','low')` |
| `created_at`, `updated_at` | `timestamptz` | `updated_at` maintained by trigger |

Index: `(user_id, created_at desc)` — every query is "my contacts, ordered".

RLS is `enable`d **and** `force`d (so it applies to the table owner too).
Grants: CRUD to `authenticated`, nothing to `anonymous` — RLS only filters rows
a role is already permitted to touch, so the grant matters independently.

Four policies, one per command, all on `(select auth.user_id()) = user_id`
(the scalar subquery makes Postgres evaluate it once per statement, not per row):

- `contacts_select_own` — SELECT, `USING`
- `contacts_insert_own` — INSERT, `WITH CHECK` only
- `contacts_update_own` — UPDATE, **both** `USING` and `WITH CHECK`
- `contacts_delete_own` — DELETE, `USING`

The distinction that matters: `USING` filters which rows a statement may
*reach*; `WITH CHECK` validates what a row may *look like afterwards*. UPDATE
needs both — `USING` stops you targeting someone else's row, `WITH CHECK` stops
you taking your own row and rewriting `user_id` to hand it away. INSERT has only
`WITH CHECK` because there is no prior row to filter.

Source of truth: `db/migrations/0001_contacts.sql`.

## Layout

```
neon.ts                          IaC: auth: true, dataApi: true
db/migrations/0001_contacts.sql  table, constraints, RLS
scripts/migrate.mjs              applies migrations; ONLY DATABASE_URL consumer
scripts/privacy-test.mjs         two-account RLS proof, hits the Data API directly
src/
  app/
    page.tsx                     routes to /contacts or /sign-in
    sign-in/, sign-up/
    contacts/page.tsx            session gate + main view
    api/contacts/route.ts        GET list (sort/filter/search), POST create
    api/contacts/[id]/route.ts   PATCH, DELETE
    globals.css                  design tokens, light + dark
  components/
    ui/index.tsx                 the component system
    auth-form.tsx, contacts-view.tsx, contact-form.tsx
  lib/
    validation.ts                Zod schemas + allow-lists  <-- the tested module
    neon-client.ts               browser client (two-URL object form)
    neon-server.ts               per-request server client scoped to a token
tests/validation.test.ts         27 cases
```

## Commands

```bash
npm run dev            # localhost:3000
npm run build
npm test               # Vitest, 27 cases, no network or DB needed
npm run db:migrate     # applies db/migrations/*.sql, self-verifies, prints policies
npm run test:privacy   # two-account RLS proof; needs a live Neon backend
npm run lint
npx tsc --noEmit
```

## State: verified vs not

**Verified locally** — TypeScript clean, ESLint clean (0 errors, 0 warnings),
27 tests passing, `next build` green with all 7 routes, unauthenticated
`GET /api/contacts` returns 401, and neither `src/` nor the built client bundle
contains a Postgres connection string.

**Now verified against a real Neon backend.** The project is linked to
`bitter-moon-70893420` / `production`, Managed Better Auth and the Data API are
provisioned, the migration is applied (`enabled: true forced: true`, four
policies), `npm run test:privacy` passes 12/12, and the app is deployed and
exercised end to end on Vercel: create `201`, read `200`, update `200`, delete
`200`, unknown id `404`.

Three of the four predicted surprises did appear, and one did not:

- The `authenticated` role *did* exist -- provisioning the Data API before
  migrating is what avoided the `grant` failure.
- `neon deploy` *did* write different env var names. It writes
  `NEON_AUTH_BASE_URL` and `NEON_DATA_API_URL`; the app reads the
  `NEXT_PUBLIC_` names. Map them in `.env.local`; do not rename what the code
  expects.
- The Better Auth response shapes *were* wrong in `scripts/privacy-test.mjs`.
  It needs an `Origin` header (403 `MISSING_OR_NULL_ORIGIN` without one), and
  `/sign-in/email` returns an opaque session token, not a JWT -- exchange the
  session **cookie** at `/token` for the real JWT.
- Unpredicted, and the expensive one: the session cookie is cross-site, so
  every session read needs `credentials: "include"`. Without it `/get-session`
  returns `200` with the body `null` and the app loops between `/contacts` and
  `/sign-in` while every request looks healthy. See the long comment in
  `src/lib/neon-client.ts`. Related: a credentialed cross-origin request with
  an unexpected custom header fails CORS preflight, so those reads must send
  no custom headers.

Two more traps worth knowing:

- `neon neon-auth domain allow-localhost` needs the `enable` sub-command. Bare,
  it exits 0 and silently does nothing.
- A deployment-specific Vercel URL is a different origin from the project
  alias, and Neon Auth rejects it with `INVALID_ORIGIN` unless separately
  trusted. Use the stable alias.

Screenshots in `docs/screenshots/` were captured locally with the API mocked.
They show real components and real CSS but not real data — replace them with
shots from the deployed app before submitting.

## Environment variables

| Variable | Exposure | Read by |
| --- | --- | --- |
| `NEXT_PUBLIC_NEON_AUTH_URL` | public, inlined in the bundle | `src/lib/neon-client.ts` |
| `NEXT_PUBLIC_NEON_DATA_API_URL` | public, inlined in the bundle | `neon-client.ts`, `neon-server.ts` |
| `DATABASE_URL` | **secret, server-only** | `scripts/migrate.mjs` only |

The two public URLs are addresses, not credentials — neither returns a row
without a valid JWT. `DATABASE_URL` *is* a credential and must never reach
`src/`, the build, or Vercel (the app does not read it).

`NEXT_PUBLIC_` values are inlined at **build** time, not read at runtime, so
changing them in Vercel requires a redeploy.

`.gitignore` ignores `.env*` with one deliberate exception: `!.env.example`.

`NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` are intentionally unused — see
"Known limitations" in the README for the trade-off.

## Gotchas discovered the hard way

**Next.js 16** (this is not the Next.js in most training data):

- `middleware.ts` is deprecated and renamed to **`proxy.ts`**, placed in `src/`
  next to `app/`, exporting a function named `proxy`. The edge runtime is not
  supported there.
- **`params` is a `Promise`** in route handlers and must be awaited:
  `{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params`.
- `cookies()`, `headers()` and `searchParams` are all async. Synchronous access
  was fully removed.
- Route handlers are not cached by default; `fetch` is not cached by default.
- `next lint` was removed; `next build` no longer lints.
- Server Functions are POSTs to their own route, so a proxy matcher that
  excludes a path also skips proxy coverage — always authenticate inside the
  handler, never rely on a proxy alone. This app does exactly that.
- The bundled docs at `node_modules/next/dist/docs/` are the reliable reference.

**Tailwind v4:**

- `@theme` is only read at the **top level**. Nesting one inside
  `@media (prefers-color-scheme: dark)` makes its values unconditional and
  silently forces the whole app dark. This bug shipped and was caught by looking
  at a screenshot. Dark mode is done by overriding the custom properties on a
  plain `:root` rule inside the media query — utilities compile to
  `var(--color-*)`, so redefining the variables is enough.
- `w-full` on a component and `w-auto` from a caller's `className` have equal
  specificity, so which wins depends on stylesheet order, not class order. Use a
  fixed-width wrapper element instead of trying to override.

**`@neondatabase/neon-js` (0.7.0-beta):**

- Client is `createClient({ auth: { url, adapter: BetterAuthReactAdapter() },
  dataApi: { url } })` — the two-URL object form.
- The Postgres JWT comes from **`auth.token()`**, which resolves to
  `{ data: { token: string } }`. It is *not* `getAccessToken()` — that is the
  OAuth-provider token, takes arguments, and returns a different shape.
- Server side uses the external-provider form: `createClient({ dataApi: { url,
  getToken } })`, which returns a plain PostgREST client with no `.auth`.
- Inspecting `node_modules/@neondatabase/auth/dist/*.d.mts` is faster and more
  reliable than the published docs for this package.

**ESLint config here treats `react-hooks/set-state-in-effect` as an error.**
Both instances were fixed properly rather than suppressed, and the fixes are
load-bearing:

- The contact dialog is mounted only while open and keyed per contact, so fresh
  state comes from remounting rather than an effect syncing props into state.
- The list fetch uses React's documented cancellation pattern with a `cancelled`
  flag. This also fixes a real race: typing in search fires overlapping
  requests, and without it a slow early response can land after a later one.

**npm:** installing devDependencies into this tree can fail with
`Cannot read properties of null (reading 'edgesOut')` — an arborist bug hit via
the better-auth peer graph. Workaround: add the entries to `package.json`
directly, then run a plain `npm install`.

**Blocked in the original build sandbox** (context for why some choices look
unusual, not constraints on this machine): `*.neon.tech`, `ui.shadcn.com` (hence
the hand-built component system rather than shadcn/ui), and Google Fonts (hence
the system font stack instead of `next/font`).

## Conventions to preserve

- **One validation schema.** `src/lib/validation.ts` is imported by the client
  form, the API routes and the tests. Client-side validation is a convenience;
  the API copy is the one that decides; the database CHECK constraints are the
  last line. Do not let these three drift.
- **No colour literals outside the token block** in `globals.css`. Components
  reference semantic roles (`surface`, `ink`, `border`, `accent`), which is what
  makes dark mode a token swap.
- **Ownership is never client-controlled.** The insert sends no `user_id`;
  updates delete `user_id` and `id` from the patch. Both are also enforced by
  the schema and by policy.
- **404, not 403,** for a contact that exists but belongs to someone else — a
  403 would confirm its existence. This falls out of RLS returning zero rows;
  there is no ownership `if` statement anywhere, and there should not be.
- Sort and filter values are checked against allow-lists (`isSortField`,
  `isPriority`) before reaching a query string.
- Every async path has a designed state: loading skeleton, two distinct empty
  states, success banner, error banner with retry, inline field errors with
  `role="alert"`.

## If something fails

Show the actual error before working around it. In particular, do not relax an
RLS policy, drop `force row level security`, or add a service-key path to make a
red message go away — a failing privacy test means the security model genuinely
is not holding, which is exactly what it exists to tell you.

---

<!-- Next.js appends its own block below on `next dev`. Leave it in place;
     removing it from a diff only re-creates the uncommitted change. -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
