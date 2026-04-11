/**
 * Client-side image processing for avatar uploads.
 * Resizes to a square crop and compresses to JPEG.
 * Uses the Canvas API — works on all browsers and devices.
 */

const AVATAR_SIZE = 256;
const JPEG_QUALITY = 0.8;

/**
 * Resize and crop an image file to a square JPEG.
 * Centre-crops to a 1:1 aspect ratio, scales to 256x256,
 * and compresses to ~30-50KB JPEG.
 */
export async function resizeAvatar(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  // Centre-crop to square
  const size = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - size) / 2;
  const sy = (bitmap.height - size) / 2;

  const canvas = new OffscreenCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}
