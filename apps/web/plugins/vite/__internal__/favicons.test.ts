import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { fetchAvatar, renderFaviconSet } from "./favicons";

async function sampleImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: { r: 200, g: 40, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

describe("renderFaviconSet", () => {
  it("renders every icon as a square with transparent rounded corners", async () => {
    const files = await renderFaviconSet(await sampleImage());
    expect(files.map((file) => file.fileName).sort()).toEqual(
      [
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "apple-touch-icon.png",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "favicon-48x48.png",
        "favicon.ico",
      ].sort(),
    );

    const apple = files.find(
      (file) => file.fileName === "apple-touch-icon.png",
    )!;
    const { data, info } = await sharp(apple.source)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([180, 180, 4]);
    expect(data[3]).toBe(0);
    const center = (90 * 180 + 90) * 4;
    expect(data[center + 3]).toBe(255);
  });

  it("rejects non-image input", async () => {
    await expect(
      renderFaviconSet(Buffer.from("not an image")),
    ).rejects.toThrow();
  });
});

describe("fetchAvatar", () => {
  it("returns the response bytes", async () => {
    const image = await sampleImage();
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(image)));
    await expect(
      fetchAvatar("https://example.com/me.png", fetchImpl as typeof fetch),
    ).resolves.toEqual(image);
  });

  it("rejects non-http URLs and failed responses", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("missing", { status: 404 }),
    );
    await expect(
      fetchAvatar("file:///etc/passwd", fetchImpl as typeof fetch),
    ).rejects.toThrow(/http/);
    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(
      fetchAvatar("https://example.com/me.png", fetchImpl as typeof fetch),
    ).rejects.toThrow(/404/);
  });

  it("rejects bodies over the size limit", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(new Uint8Array(11 * 1024 * 1024)),
    );
    await expect(
      fetchAvatar("https://example.com/me.png", fetchImpl as typeof fetch),
    ).rejects.toThrow(/size limit/);
  });
});
