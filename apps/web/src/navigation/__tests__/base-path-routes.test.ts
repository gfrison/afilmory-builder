import { describe, expect, it, vi } from "vitest";

// Simulate a subpath deploy where router state paths keep the "/photos" base.
vi.mock("../../lib/public-base", () => ({
  PUBLIC_BASE_PATH: "/photos",
  withBasePath: (url: string) => url,
}));

const { parsePhotoId, isMapPath, stripBasePath } = await import("../routes");

describe("route matchers under a base path", () => {
  it("treats the base root as the gallery, not a photo", () => {
    expect(parsePhotoId("/photos/")).toBeNull();
    expect(parsePhotoId("/photos")).toBeNull();
    expect(stripBasePath("/photos/")).toBe("/");
  });

  it("resolves a base-prefixed photo detail path", () => {
    expect(parsePhotoId("/photos/airport")).toBe("airport");
    expect(parsePhotoId("/photos/airport/")).toBe("airport");
  });

  it("detects the map route under the base path", () => {
    expect(isMapPath("/photos/explore")).toBe(true);
    expect(isMapPath("/photos/explore/")).toBe(true);
    expect(parsePhotoId("/photos/explore")).toBeNull();
  });

  it("still works for already base-relative paths", () => {
    expect(parsePhotoId("/airport")).toBe("airport");
    expect(isMapPath("/explore")).toBe(true);
  });
});
