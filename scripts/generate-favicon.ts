/* eslint-disable no-console */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderFaviconSet } from "../apps/web/plugins/vite/__internal__/favicons";

const __dirname = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(__dirname, "..");
const defaultOutputDir = join(monorepoRoot, "apps/web/public");

export async function generateFavicons(outputDir = defaultOutputDir) {
  const logoPath = join(monorepoRoot, "logo.png");

  if (!existsSync(logoPath)) {
    throw new Error("Logo file not found: logo.png");
  }

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    const files = await renderFaviconSet(readFileSync(logoPath));
    for (const { fileName, source } of files) {
      writeFileSync(join(outputDir, fileName), source);
      console.info(`✅ Generated favicon: ${fileName}`);
    }

    // PWA manifest 由 vite-plugin-pwa 生成，这里不再生成重复的文件

    console.info(
      `🎨 All favicons generated successfully from logo.png into ${outputDir}`,
    );
  } catch (error) {
    console.error("❌ Error generating favicons:", error);
    throw error;
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  generateFavicons(
    process.argv[2] ? resolve(process.argv[2]) : undefined,
  ).catch(console.error);
}
