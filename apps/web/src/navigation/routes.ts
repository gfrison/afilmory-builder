import type { GalleryFilterState } from "~/lib/gallery-filter-url";
import {
  buildGalleryFilterSearch,
  getGalleryFiltersFromSearch,
} from "~/lib/gallery-filter-url";
import { buildPhotoDetailPathname } from "~/lib/photo-detail-route";
import { PUBLIC_BASE_PATH } from "~/lib/public-base";

export type AppDestination = { pathname: string; search: string };

// The data router's state.location.pathname keeps the deploy base prefix (unlike
// useLocation); strip it so route matchers are base-agnostic.
export const stripBasePath = (pathname: string): string => {
  if (!PUBLIC_BASE_PATH) return pathname;
  if (pathname === PUBLIC_BASE_PATH) return "/";
  if (pathname.startsWith(`${PUBLIC_BASE_PATH}/`))
    return pathname.slice(PUBLIC_BASE_PATH.length);
  return pathname;
};

// Root-level single-segment paths reserved for app routes and asset namespaces;
// they share the detail route shape but are never photo ids.
const RESERVED_ROOT_SEGMENTS = new Set([
  "explore",
  "assets",
  "thumbnails",
  "originals",
  "vendor",
  "manifest",
]);

export function parsePhotoId(pathname: string): string | null {
  const match = /^\/([^/]+)\/?$/.exec(stripBasePath(pathname));
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  return RESERVED_ROOT_SEGMENTS.has(id.toLowerCase()) ? null : id;
}

// Router static segments match case-insensitively, so /EXPLORE is the map too.
export const isMapPath = (pathname: string) =>
  /^\/explore\/?$/i.test(stripBasePath(pathname));
export const gallerySearch = (search: string) =>
  buildGalleryFilterSearch("", getGalleryFiltersFromSearch(search));
export const galleryDestination = (
  filters: GalleryFilterState,
): AppDestination => ({
  pathname: "/",
  search: buildGalleryFilterSearch("", filters),
});

export function mapSearch(search: string): string {
  const input = new URLSearchParams(search);
  const output = new URLSearchParams();
  for (const key of ["photoId", "regionId", "locationId"] as const) {
    const value = input.get(key);
    if (value) output.set(key, value);
  }
  if (input.get("mode") === "photos") output.set("mode", "photos");
  return output.size > 0 ? `?${output}` : "";
}

export function safeDestination(input: unknown): AppDestination | null {
  if (
    typeof input !== "string" ||
    !input.startsWith("/") ||
    input.startsWith("//")
  )
    return null;
  try {
    const url = new URL(input, "https://afilmory.invalid");
    if (url.origin !== "https://afilmory.invalid") return null;
    if (url.pathname === "/")
      return { pathname: "/", search: gallerySearch(url.search) };
    if (isMapPath(url.pathname))
      return { pathname: "/explore", search: mapSearch(url.search) };
  } catch {
    /* Invalid external input has no navigation authority. */
  }
  return null;
}

export const photoDestination = (id: string, search = ""): AppDestination => ({
  pathname: buildPhotoDetailPathname(id),
  search: gallerySearch(search),
});
export const destinationHref = (destination: AppDestination) =>
  `${destination.pathname}${destination.search}`;
