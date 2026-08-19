export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_EDGE = 6_000;
const MAX_IMAGE_PIXELS = 24_000_000;

export async function validateImageFile(file: File, maxBytes = MAX_IMAGE_BYTES): Promise<string | null> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size <= 0 || file.size > maxBytes) {
    return `Choose an image smaller than ${Math.floor(maxBytes / 1024 / 1024)} MB.`;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const valid = bitmap.width > 0 && bitmap.height > 0
      && bitmap.width <= MAX_IMAGE_EDGE && bitmap.height <= MAX_IMAGE_EDGE
      && bitmap.width * bitmap.height <= MAX_IMAGE_PIXELS;
    bitmap.close();
    return valid ? null : "Choose an image no larger than 6,000 px or 24 megapixels.";
  } catch {
    return "That file could not be decoded as an image.";
  }
}
