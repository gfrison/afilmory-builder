import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { generateOGImage } from "@afilmory/build-assets";
import type { PhotoManifestItem } from "@afilmory/schema";
import { assertManifest } from "@afilmory/schema";
import type { Plugin, ResolvedConfig } from "vite";

// site.config is intentionally a repository-level, browser-safe config file.
import type { SiteConfig } from "../../../../site.config";
import { DEFAULT_AUTHOR_AVATAR } from "../../../../site.config";
import { MANIFEST_PATH } from "./__internal__/constants";
import { fetchAvatar, renderFaviconSet } from "./__internal__/favicons";
import {
  createPhotoPageHtml,
  generateSitemap,
  injectHomeMetadata,
  normalizeBaseUrl,
  sortPhotosNewestFirst,
} from "./build-assets-seo";
import { generateRSSFeed } from "./rss";

export {
  createPhotoPageHtml,
  generateSitemap,
  injectHomeMetadata,
} from "./build-assets-seo";

// Photo shells are written at the site root, so their ids must not shadow the
// top-level application/asset paths that ship alongside them.
const RESERVED_PHOTO_SHELL_IDS = new Set([
  "assets",
  "thumbnails",
  "originals",
  "vendor",
  "explore",
  "manifest",
]);

async function loadAvatarFavicons(avatar: string | undefined) {
  if (!avatar || avatar === DEFAULT_AUTHOR_AVATAR) return [];
  return renderFaviconSet(await fetchAvatar(avatar));
}

interface OGImagePluginOptions {
  title?: string;
  description?: string;
  siteName?: string;
  siteUrl?: string;
}

export function buildAssetsPlugin(
  ogOptions: OGImagePluginOptions = {},
  siteConfig: SiteConfig,
): Plugin {
  const {
    title = "Afilmory",
    description = "Capturing beautiful moments in life, documenting daily warmth and emotions through my lens.",
    siteName = "Afilmory",
    siteUrl,
  } = ogOptions;

  let ogImagePath = "";
  let resolvedConfig: ResolvedConfig | null = null;
  let staticPhotos: PhotoManifestItem[] = [];

  return {
    name: "build-assets",
    apply: "build",
    configResolved(config) {
      resolvedConfig = config;
    },
    async buildStart() {
      const avatarFavicons = loadAvatarFavicons(siteConfig.author.avatar);
      // Stays observed if the OG step aborts the build before it is awaited.
      avatarFavicons.catch(() => {});
      try {
        const ogImage = await generateOGImage({
          title,
          description,
          outputPath: "assets/og-image.png",
          includePhotos: true,
          photoCount: 4,
          writeToDisk: false,
        });
        const hash = createHash("sha256")
          .update(ogImage.buffer)
          .digest("hex")
          .slice(0, 10);
        const fileName = `assets/og-image-${hash}.png`;

        this.emitFile({
          type: "asset",
          fileName,
          source: ogImage.buffer,
        });
        ogImagePath = `/${fileName}`;
        this.info(`OG image generated: ${ogImagePath}`);
      } catch (error) {
        this.error(
          `Failed to generate OG image: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      try {
        const files = await avatarFavicons;
        for (const { fileName, source } of files) {
          this.emitFile({ type: "asset", fileName, source });
        }
        if (files.length > 0) {
          this.info(`Site icons generated from author avatar`);
        }
      } catch (error) {
        this.warn(
          `Using default site icons; author avatar could not be converted: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    generateBundle() {
      try {
        const manifest = assertManifest(
          JSON.parse(readFileSync(MANIFEST_PATH, "utf8")),
        );
        staticPhotos = sortPhotosNewestFirst(manifest.photos);

        this.emitFile({
          type: "asset",
          fileName: "feed.xml",
          source: generateRSSFeed(
            staticPhotos,
            siteConfig,
            manifest.generatedAt,
          ),
        });
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: generateSitemap(
            staticPhotos,
            siteConfig,
            manifest.generatedAt,
          ),
        });

        this.info(`Generated RSS feed with ${staticPhotos.length} photos`);
        this.info(`Generated sitemap with ${staticPhotos.length + 1} URLs`);
      } catch (error) {
        this.error(
          `Error generating static web assets: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    async writeBundle() {
      if (!resolvedConfig) {
        this.error("Cannot generate photo pages before Vite config resolves");
        return;
      }
      const outputDirectory = path.resolve(
        resolvedConfig.root,
        resolvedConfig.build.outDir,
      );
      try {
        // Vite creates index.html after user generateBundle hooks. Reading the
        // written output here guarantees every photo shell inherits the final,
        // minified document (including the single PWA manifest link).
        const baseHtml = await readFile(
          path.join(outputDirectory, "index.html"),
          "utf8",
        );
        // Keep file-descriptor usage bounded for very large libraries.
        for (const photo of staticPhotos) {
          // Photo shells live at the site root (/<id>/) so ids must not collide
          // with reserved top-level paths served alongside them.
          if (RESERVED_PHOTO_SHELL_IDS.has(photo.id.toLowerCase())) {
            this.error(
              `Photo id "${photo.id}" collides with a reserved application path; rename the source file.`,
            );
            return;
          }
          const photoDirectory = path.join(outputDirectory, photo.id);
          await mkdir(photoDirectory, { recursive: true });
          await writeFile(
            path.join(photoDirectory, "index.html"),
            createPhotoPageHtml(baseHtml, photo, siteConfig),
            "utf8",
          );
        }
        this.info(`Generated ${staticPhotos.length} static photo pages`);
      } catch (error) {
        this.error(
          `Error generating static photo pages: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (!ogImagePath) {
          throw new Error("No generated OG image is available");
        }
        const baseUrl = normalizeBaseUrl(siteUrl || siteConfig.url);
        return injectHomeMetadata(html, {
          title,
          description,
          siteName,
          siteUrl: baseUrl,
          imageUrl: `${baseUrl}${ogImagePath}`,
        });
      },
    },
  };
}
