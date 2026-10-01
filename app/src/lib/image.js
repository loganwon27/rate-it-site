/** Loads a picked file as an upright bitmap (phone photos carry rotation info that browsers apply here). */
export async function loadBitmap(file) {
  if (!file || !file.type.startsWith('image/')) throw Object.assign(new Error('not an image'), {
    userMessage: "That file isn't a photo. Pick a JPG, PNG or HEIC image.",
  });
  try {
    return await createImageBitmap(file);
  } catch {
    throw Object.assign(new Error('decode failed'), { userMessage: "That photo couldn't be opened. Try another one." });
  }
}

/** Centre-crops (optionally to a square) and scales down, returning a JPEG blob. Used for avatars. */
export async function cropToJpeg(file, { maxSize, square = false, quality = 0.85 }) {
  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sw = square ? side : bitmap.width;
  const sh = square ? side : bitmap.height;
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}
