import { defineConfig } from "@neon/config/v1";

/**
 * Neon infrastructure-as-code.
 *
 * `auth`    — Managed Better Auth: users and sessions stored in Postgres
 *             under the `neon_auth` schema, one isolated auth environment
 *             per branch.
 * `dataApi` — the PostgREST-compatible Data API. It verifies requests with
 *             Neon Auth by default, which is why `auth` must be enabled
 *             alongside it (the types enforce this).
 *
 * Apply with `neon deploy`, which provisions both services on the linked
 * branch and pulls the resulting env vars into .env.local.
 */
export default defineConfig({
  auth: true,
  dataApi: true,
  branch: (branch) => {
    if (branch.isDefault) {
      // production / main: use project defaults, never auto-expire
      return {};
    }
    if (!branch.exists) {
      // new feature branches clean themselves up after a week
      return { ttl: "7d" };
    }
    return {};
  },
});
