import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SiteConfig } from "../../../../site.config";
import { DEFAULT_AUTHOR_AVATAR } from "../../../../site.config";
import { buildAssetsPlugin } from "./build-assets";

const { fetchAvatar, renderFaviconSet } = vi.hoisted(() => ({
  fetchAvatar: vi.fn(),
  renderFaviconSet: vi.fn(),
}));

vi.mock("@afilmory/build-assets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@afilmory/build-assets")>()),
  generateOGImage: vi.fn(async () => ({ buffer: Buffer.from("og") })),
}));
vi.mock("./__internal__/favicons", () => ({ fetchAvatar, renderFaviconSet }));

function siteConfig(avatar?: string): SiteConfig {
  return {
    name: "Gallery",
    title: "Gallery",
    description: "Photos",
    url: "https://example.com",
    accentColor: "#123456",
    author: { name: "Author", url: "https://example.com", avatar },
  };
}

async function runBuildStart(avatar?: string) {
  const context = {
    emitFile: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const plugin = buildAssetsPlugin({}, siteConfig(avatar));
  await (plugin.buildStart as (this: unknown) => Promise<void>).call(context);
  const iconFiles = context.emitFile.mock.calls
    .map(([file]) => (file as { fileName: string }).fileName)
    .filter((name) => !name.startsWith("assets/og-image-"));
  return { context, iconFiles };
}

describe("buildAssetsPlugin avatar favicons", () => {
  beforeEach(() => {
    fetchAvatar.mockReset();
    renderFaviconSet.mockReset();
  });

  it("emits icons rendered from a custom avatar", async () => {
    fetchAvatar.mockResolvedValue(Buffer.from("avatar"));
    renderFaviconSet.mockResolvedValue([
      { fileName: "favicon.ico", source: Buffer.from("ico") },
      { fileName: "apple-touch-icon.png", source: Buffer.from("png") },
    ]);
    const { context, iconFiles } = await runBuildStart(
      "https://example.com/me.png",
    );
    expect(fetchAvatar).toHaveBeenCalledWith("https://example.com/me.png");
    expect(iconFiles).toEqual(["favicon.ico", "apple-touch-icon.png"]);
    expect(context.warn).not.toHaveBeenCalled();
  });

  it("warns and keeps default icons when the avatar cannot be fetched", async () => {
    fetchAvatar.mockRejectedValue(new Error("offline"));
    const { context, iconFiles } = await runBuildStart(
      "https://example.com/me.png",
    );
    expect(iconFiles).toEqual([]);
    expect(context.warn).toHaveBeenCalledWith(
      expect.stringContaining("offline"),
    );
    expect(context.error).not.toHaveBeenCalled();
  });

  it("does not fetch for a missing or stock default avatar", async () => {
    await runBuildStart(undefined);
    await runBuildStart(DEFAULT_AUTHOR_AVATAR);
    expect(fetchAvatar).not.toHaveBeenCalled();
  });
});
