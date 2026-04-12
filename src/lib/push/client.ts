"use client";

/**
 * Client-side push helpers. Exposed without a server-only import so
 * browser components can reach them; no secrets live here — only the
 * public VAPID key (NEXT_PUBLIC_VAPID_PUBLIC_KEY) is read.
 */

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  // The VAPID public key Chrome expects is raw bytes — decode from
  // URL-safe base64 without padding. Back the Uint8Array with a plain
  // ArrayBuffer so it matches the BufferSource type that PushManager's
  // applicationServerKey expects (TS 5.7+ distinguishes this from
  // SharedArrayBuffer-backed views).
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normal = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normal);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** True when the user agent supports Web Push end-to-end. */
export function pushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Current subscription status — "granted"/"denied"/"default" mirrors
 * the Notification permission; "subscribed" additionally reflects the
 * presence of a live PushManager subscription.
 */
export type PushStatus = "unsupported" | "denied" | "default" | "granted" | "subscribed";

export async function readPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";

  const perm = Notification.permission;
  if (perm === "denied") return "denied";
  if (perm === "default") return "default";

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    return existing ? "subscribed" : "granted";
  } catch {
    return "granted";
  }
}

export interface SerializedSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Request notification permission (if not already granted) and
 * subscribe this device via PushManager. Returns the serialised
 * subscription shape — the caller is expected to POST it to the
 * `savePushSubscription` server action so it lands in push_subscriptions.
 *
 * The Notification permission prompt must run from a user gesture,
 * so this function should only be called from a click handler.
 */
export async function subscribeDevice(): Promise<SerializedSubscription | { error: string }> {
  if (!pushSupported()) return { error: "Push notifications aren't supported here." };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return { error: "Push notifications aren't configured." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { error: "Notifications were blocked. Enable them in your browser settings." };
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) {
    return { error: "Subscription payload was incomplete." };
  }
  return { endpoint: json.endpoint, p256dh, auth };
}

/**
 * Clear this device's subscription. Calls PushManager.unsubscribe and
 * returns the endpoint so the caller can ask the server to evict the
 * matching `push_subscriptions` row.
 */
export async function unsubscribeDevice(): Promise<{ endpoint: string | null }> {
  if (!pushSupported()) return { endpoint: null };
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (!existing) return { endpoint: null };
  const endpoint = existing.endpoint;
  try {
    await existing.unsubscribe();
  } catch {
    // Non-fatal — we still want to clear the DB row below.
  }
  return { endpoint };
}
