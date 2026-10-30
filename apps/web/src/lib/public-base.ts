// Vite injects the configured `base` as import.meta.env.BASE_URL (e.g. "/photos/").
const rawBase = import.meta.env.BASE_URL || "/";

// "" when deployed at the domain root, otherwise the base without a trailing slash.
export const PUBLIC_BASE_PATH =
  rawBase === "/" ? "" : rawBase.replace(/\/$/, "");

// Prefix a root-relative public URL (e.g. manifest thumbnail/original paths) with
// the deployment base so it resolves under a subpath. Absolute and already-prefixed
// URLs are returned unchanged.
export function withBasePath(url: string): string {
  if (!PUBLIC_BASE_PATH) return url;
  if (!url.startsWith("/") || url.startsWith("//")) return url;
  if (url === PUBLIC_BASE_PATH || url.startsWith(`${PUBLIC_BASE_PATH}/`)) {
    return url;
  }
  return `${PUBLIC_BASE_PATH}${url}`;
}
