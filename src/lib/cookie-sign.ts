import { env, hasCookieSecret } from "./env";

/**
 * HMAC-backed sign / verify helpers for middleware cookies that we
 * trust for *performance fast-paths*, not *auth decisions*. The
 * `chork-onboarded` + `chork-auth-shell` cookies let middleware
 * skip a profile round-trip on every nav; if a user forges them
 * via DevTools, nothing catastrophic happens — `requireAuth()`
 * on the downstream page still re-reads profiles and enforces the
 * gym/onboarded state. But the middleware layer shouldn't trust
 * arbitrary client-written data either; signing closes the gap so
 * a forged cookie causes middleware to discard the fast-path and
 * fall through to a real DB check.
 *
 * When `CHORK_COOKIE_SECRET` isn't set (fresh clone, local dev
 * without the var), both helpers fall through: `sign` writes the
 * plain value and `verify` accepts it as-is. This preserves the
 * pre-signing behaviour so pulling the repo doesn't require
 * setting a secret to boot. In production the env var should be
 * set — see `.env.example`.
 *
 * Uses Web Crypto (`crypto.subtle`) rather than `node:crypto` so
 * this module is importable from middleware, which runs in Vercel's
 * edge runtime and has no `node:*` modules. Web Crypto is async,
 * so `sign` + `verify` return Promises.
 */

const SIG_LEN = 22; // truncated base64url(sha256) — 22 chars = ~132 bits

// 32-byte raw key cache. Importing a key has non-trivial cost and
// the secret doesn't change at runtime, so memoise.
let _keyPromise: Promise<CryptoKey> | null = null;

function getKey(secretHex: string): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;
  // Hex string → Uint8Array. crypto.subtle.importKey doesn't accept
  // hex directly; decode in chunks of 2.
  const bytes = new Uint8Array(secretHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(secretHex.slice(i * 2, i * 2 + 2), 16);
  }
  _keyPromise = crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return _keyPromise;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  // btoa is available in both node (modern versions) and edge.
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function computeSignature(value: string): Promise<string> {
  if (!env.CHORK_COOKIE_SECRET) throw new Error("Missing CHORK_COOKIE_SECRET");
  const key = await getKey(env.CHORK_COOKIE_SECRET);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(sig)).slice(0, SIG_LEN);
}

/**
 * Wrap `value` with an HMAC signature. Returns `value.<sig>` so the
 * raw value is still decodable without the secret.
 *
 * Fall-through when no secret is configured — returns the bare value
 * so dev-without-secret still boots.
 */
export async function sign(value: string): Promise<string> {
  if (!hasCookieSecret) return value;
  const sig = await computeSignature(value);
  return `${value}.${sig}`;
}

/**
 * Recover the original value from a signed cookie, or return null if
 * the signature is missing / mismatched. Fall-through returns the
 * bare value when no secret is configured.
 *
 * Constant-time compare via `crypto.subtle.verify` (which the spec
 * guarantees doesn't early-exit on signature mismatches).
 */
export async function verify(signed: string | undefined): Promise<string | null> {
  if (signed === undefined) return null;
  if (!hasCookieSecret) return signed;

  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;

  const value = signed.slice(0, dot);
  const received = signed.slice(dot + 1);
  if (received.length !== SIG_LEN) return null;

  try {
    const expected = await computeSignature(value);
    // `expected` and `received` are equal-length strings; compare
    // byte-wise to stay in constant time.
    if (expected.length !== received.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
    }
    return diff === 0 ? value : null;
  } catch {
    return null;
  }
}
