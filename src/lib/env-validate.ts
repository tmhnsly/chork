/**
 * Env validation, extracted from `env.ts` as a pure function.
 *
 * Two reasons it lives here rather than inline.
 *
 * It used to be a zod schema, and zod's only consumer in the whole
 * repo was that schema. `env.ts` is reachable from client code —
 * `auth-context.tsx` reads `env.SITE_URL` — so zod was bundled into a
 * 280KB chunk (65KB gz) that every page downloaded, to check a dozen
 * strings at boot. The rules here are presence, non-empty, exact
 * length, valid URL and one enum; that is not worth a dependency in
 * the critical path of every page load, nor its weight in the
 * serverless bundle where it also costs cold-start time.
 *
 * And `env.ts` validates at module load and throws, which makes it
 * effectively untestable — importing it in a test either succeeds or
 * detonates the suite. A pure `(raw) => result` function can be
 * checked against a bad environment without setting one up.
 *
 * Behaviour is deliberately identical to the zod version it replaces:
 * every issue is collected rather than failing on the first, only
 * `undefined` counts as absent (an explicitly empty var is present
 * and therefore invalid), and the thrown message keeps the same
 * one-line-per-key shape that reads cleanly in build logs.
 */

export interface EnvIssue {
  key: string;
  message: string;
}

export type RawEnv = Record<string, string | undefined>;

export interface ValidatedEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  NEXT_PUBLIC_SITE_URL: string;
  CHORK_COOKIE_SECRET: string | undefined;
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: string | undefined;
  VAPID_PRIVATE_KEY: string | undefined;
  VAPID_SUBJECT: string | undefined;
  UPSTASH_REDIS_REST_URL: string | undefined;
  UPSTASH_REDIS_REST_TOKEN: string | undefined;
  NEXT_PUBLIC_SENTRY_DSN: string | undefined;
  SENTRY_AUTH_TOKEN: string | undefined;
  NODE_ENV: "development" | "test" | "production";
}

export type EnvResult =
  | { ok: true; data: ValidatedEnv }
  | { ok: false; issues: EnvIssue[] };

const NODE_ENVS = ["development", "test", "production"] as const;

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate a raw env bag.
 *
 * `isServer` decides whether the server-only secret is required. On
 * the client those vars are legitimately `undefined` — Next only
 * inlines `NEXT_PUBLIC_*` into the browser bundle, deliberately, so
 * `SUPABASE_SERVICE_ROLE_KEY` can't leak to every visitor. Requiring
 * it unconditionally would make `env` throw inside any client
 * component that just wanted to read `SITE_URL`.
 */
export function validateEnv(raw: RawEnv, isServer: boolean): EnvResult {
  const issues: EnvIssue[] = [];

  function check(
    key: string,
    rules: {
      required?: boolean;
      nonEmpty?: boolean;
      exactLength?: number;
      url?: boolean;
    },
  ): string | undefined {
    const value = raw[key];
    if (value === undefined) {
      if (rules.required) issues.push({ key, message: "Required" });
      return undefined;
    }
    if (rules.exactLength !== undefined && value.length !== rules.exactLength) {
      issues.push({
        key,
        message: `Must be exactly ${rules.exactLength} characters (got ${value.length})`,
      });
      return undefined;
    }
    if (rules.nonEmpty && value.length < 1) {
      issues.push({ key, message: "Must not be empty" });
      return undefined;
    }
    if (rules.url && !isUrl(value)) {
      issues.push({ key, message: "Must be a valid URL" });
      return undefined;
    }
    return value;
  }

  const supabaseUrl = check("NEXT_PUBLIC_SUPABASE_URL", { required: true, url: true });
  const supabaseAnonKey = check("NEXT_PUBLIC_SUPABASE_ANON_KEY", { required: true, nonEmpty: true });
  const serviceRoleKey = check("SUPABASE_SERVICE_ROLE_KEY", {
    // Required on the server only — see the doc comment above.
    required: isServer,
    nonEmpty: isServer,
  });
  const siteUrl = check("NEXT_PUBLIC_SITE_URL", { required: true, url: true });

  // 32 bytes hex = 64 chars. `openssl rand -hex 32`.
  const cookieSecret = check("CHORK_COOKIE_SECRET", { exactLength: 64 });
  const vapidPublic = check("NEXT_PUBLIC_VAPID_PUBLIC_KEY", {});
  const vapidPrivate = check("VAPID_PRIVATE_KEY", {});
  const vapidSubject = check("VAPID_SUBJECT", {});
  const upstashUrl = check("UPSTASH_REDIS_REST_URL", { url: true });
  const upstashToken = check("UPSTASH_REDIS_REST_TOKEN", {});
  const sentryDsn = check("NEXT_PUBLIC_SENTRY_DSN", { url: true });
  const sentryToken = check("SENTRY_AUTH_TOKEN", {});

  const rawNodeEnv = raw.NODE_ENV;
  let nodeEnv: ValidatedEnv["NODE_ENV"] = "development";
  if (rawNodeEnv !== undefined) {
    if ((NODE_ENVS as readonly string[]).includes(rawNodeEnv)) {
      nodeEnv = rawNodeEnv as ValidatedEnv["NODE_ENV"];
    } else {
      issues.push({
        key: "NODE_ENV",
        message: `Must be one of: ${NODE_ENVS.join(", ")}`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    data: {
      // Non-null assertions are sound here: each required key pushed
      // an issue when absent, and we returned above if any did.
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey!,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      NEXT_PUBLIC_SITE_URL: siteUrl!,
      CHORK_COOKIE_SECRET: cookieSecret,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapidPublic,
      VAPID_PRIVATE_KEY: vapidPrivate,
      VAPID_SUBJECT: vapidSubject,
      UPSTASH_REDIS_REST_URL: upstashUrl,
      UPSTASH_REDIS_REST_TOKEN: upstashToken,
      NEXT_PUBLIC_SENTRY_DSN: sentryDsn,
      SENTRY_AUTH_TOKEN: sentryToken,
      NODE_ENV: nodeEnv,
    },
  };
}

/** Build the thrown message. Same shape the zod version produced. */
export function formatEnvIssues(issues: EnvIssue[]): string {
  const lines = issues.map((i) => `  • ${i.key}: ${i.message}`).join("\n");
  return (
    `Invalid or missing environment variables:\n${lines}\n` +
    "See src/lib/env.ts for the full schema."
  );
}
