export function firstImage(images: unknown): string | undefined {
  if (typeof images === 'string') return images;
  return Array.isArray(images) && typeof images[0] === 'string' ? images[0] : undefined;
}
