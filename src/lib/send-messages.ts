/**
 * Random toast copy shown when a climber completes a route.
 *
 * Edit these lists freely — keep them short (two or three words is
 * ideal so they fit the toast on small screens) and on-brand.
 *
 * `FLASH_MESSAGES` are reserved for first-attempt sends so flashing
 * a boulder feels genuinely different from a normal send.
 */

export const SEND_MESSAGES: readonly string[] = [
  "Nice one!",
  "Smashed it!",
  "Sent!",
  "Send train!",
  "Crushed it!",
  "Top out!",
  "Clean send!",
  "Chef's kiss",
  "Strong!",
  "Wall to yourself",
  "Pulled hard!",
  "Locked in",
];

export const FLASH_MESSAGES: readonly string[] = [
  "Flash!",
  "First go!",
  "No warm-up needed",
  "Didn't even blink",
  "Flashed it!",
  "Onsight energy",
  "One and done",
  "Cold send!",
];

export function pickSendMessage(isFlash: boolean): string {
  const pool = isFlash ? FLASH_MESSAGES : SEND_MESSAGES;
  return pool[Math.floor(Math.random() * pool.length)];
}
