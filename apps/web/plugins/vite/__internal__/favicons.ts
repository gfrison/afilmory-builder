import sharp from "sharp";

export interface FaviconFile {
  fileName: string;
  source: Buffer;
}

export const FAVICON_SIZES = [
  { size: 16, fileName: "favicon-16x16.png" },
  { size: 32, fileName: "favicon-32x32.png" },
  { size: 48, fileName: "favicon-48x48.png" },
  { size: 180, fileName: "apple-touch-icon.png" },
  { size: 192, fileName: "android-chrome-192x192.png" },
  { size: 512, fileName: "android-chrome-512x512.png" },
] as const;

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const AVATAR_FETCH_TIMEOUT_MS = 10_000;
const MAX_INPUT_PIXELS = 50_000_000;

function roundedCornersMask(size: number): Buffer {
  const r = Math.round(size * 0.12);
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/></svg>`,
  );
}

async function renderIcon(source: Buffer, size: number): Promise<Buffer> {
  const resized = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS })
    .resize(size, size, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  return sharp(resized)
    .composite([{ input: roundedCornersMask(size), blend: "dest-in" }])
    .png({ compressionLevel: 6 })
    .toBuffer();
}

export async function renderFaviconSet(source: Buffer): Promise<FaviconFile[]> {
  const files: FaviconFile[] = await Promise.all(
    FAVICON_SIZES.map(async ({ size, fileName }) => ({
      fileName,
      source: await renderIcon(source, size),
    })),
  );
  // favicon.ico historically ships the 32px PNG bytes; browsers accept it.
  const ico = files.find((file) => file.fileName === "favicon-32x32.png")!;
  files.push({ fileName: "favicon.ico", source: ico.source });
  return files;
}

export async function fetchAvatar(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Avatar URL must use http(s): ${url}`);
  }
  const response = await fetchImpl(parsed, {
    redirect: "follow",
    signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Avatar request failed with HTTP ${response.status}`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (declaredLength > MAX_AVATAR_BYTES) {
    throw new Error("Avatar exceeds the 10 MB size limit");
  }
  if (!response.body) {
    throw new Error("Avatar response has no body");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AVATAR_BYTES) {
      await reader.cancel();
      throw new Error("Avatar exceeds the 10 MB size limit");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
