// Returns a remote URL safe to pass to <Image source={{ uri }} />.
// React Native iOS cannot load blob:, file: (web), data: tiny placeholders, etc.
// Anything that's not http(s) → undefined so the caller falls back to a default.
export function safeImageUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return undefined;
}
