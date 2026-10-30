/* eslint-disable no-console */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const CONFIG_PATH = process.env.AFILMORY_CONFIG ?? "/config/config.yaml";
const OUTPUT_DIR = process.env.AFILMORY_OUTPUT ?? "/output";
const DEFAULT_LOCAL_PHOTOS_PATH = "/data/photos";
const DIST_DIR = path.join(repoRoot, "apps/web/dist");

// Config keys that hold secrets; these are logged as redacted.
const SECRET_ENV_KEYS = new Set(["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]);

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return undefined;
}

// Flatten the YAML config into the flat env-var names env.ts consumes.
function configToEnv(config: Json): Record<string, string> {
  const site = asRecord(config.site);
  const author = asRecord(config.author);
  const social = asRecord(config.social);
  const feed = asRecord(config.feed);
  const map = asRecord(config.map);
  const license = asRecord(config.license);
  const storage = asRecord(config.storage);
  const local = asRecord(storage.local);
  const s3 = asRecord(storage.s3);

  const mapping: Record<string, unknown> = {
    BASE_PATH: config.basePath,
    PHOTO_LOCATION_MODE: config.photoLocationMode,

    SITE_NAME: site.name,
    SITE_TITLE: site.title,
    SITE_DESCRIPTION: site.description,
    SITE_URL: site.url,
    SITE_LANGUAGE: site.language,
    SITE_ACCENT_COLOR: site.accentColor,

    AUTHOR_NAME: author.name,
    AUTHOR_URL: author.url,
    AUTHOR_AVATAR: author.avatar,

    SOCIAL_GITHUB: social.github,
    SOCIAL_TWITTER: social.twitter,
    SOCIAL_RSS: social.rss,

    FEED_FOLO_FEED_ID: feed.foloFeedId,
    FEED_FOLO_USER_ID: feed.foloUserId,

    MAP_STYLE: map.style,
    MAP_PROJECTION: map.projection,
    MAPBOX_TOKEN: map.mapboxToken,

    // AGPL corresponding-source attribution for network-deployed sites.
    AFILMORY_SOURCE_URL: license.sourceUrl,
    AFILMORY_CORRESPONDING_SOURCE_URL: license.correspondingSourceUrl,
    AFILMORY_LICENSE_URL: license.licenseUrl,
    AFILMORY_REQUIRE_EXACT_SOURCE: license.requireExactSource,

    PHOTO_STORAGE_PROVIDER: storage.provider,
    LOCAL_PHOTOS_PATH: local.photosPath,
    LOCAL_PHOTOS_BASE_URL: local.baseUrl,

    S3_BUCKET_NAME: s3.bucket,
    S3_REGION: s3.region,
    S3_ENDPOINT: s3.endpoint,
    S3_ACCESS_KEY_ID: s3.accessKeyId,
    S3_SECRET_ACCESS_KEY: s3.secretAccessKey,
    S3_PREFIX: s3.prefix,
    S3_CUSTOM_DOMAIN: s3.customDomain,
    S3_EXCLUDE_REGEX: s3.excludeRegex,
  };

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(mapping)) {
    const value = stringify(raw);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function loadConfigEnv(): Promise<Record<string, string>> {
  if (!existsSync(CONFIG_PATH)) {
    console.warn(
      `[afilmory] No config file at ${CONFIG_PATH}; relying on environment variables only.`,
    );
    return {};
  }
  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = asRecord(parseYaml(raw));
  return configToEnv(parsed);
}

// Real environment variables win over config-file values so secrets can be
// injected with `docker run -e ...` without ever living in the YAML file.
function applyEnv(configEnv: Record<string, string>): void {
  for (const [key, value] of Object.entries(configEnv)) {
    if (process.env[key] === undefined || process.env[key] === "") {
      process.env[key] = value;
    }
  }

  if (!process.env.PHOTO_STORAGE_PROVIDER) {
    process.env.PHOTO_STORAGE_PROVIDER = "local";
  }
  if (
    process.env.PHOTO_STORAGE_PROVIDER === "local" &&
    !process.env.LOCAL_PHOTOS_PATH
  ) {
    process.env.LOCAL_PHOTOS_PATH = DEFAULT_LOCAL_PHOTOS_PATH;
  }
  // Fail the build on any photo/manifest error instead of shipping a partial site.
  if (!process.env.REQUIRE_FRESH_BUILD) {
    process.env.REQUIRE_FRESH_BUILD = "true";
  }
  if (!process.env.BUILDER_FAIL_ON_PHOTO_ERROR) {
    process.env.BUILDER_FAIL_ON_PHOTO_ERROR = "true";
  }
}

function logResolvedConfig(): void {
  const keys = [
    "PHOTO_STORAGE_PROVIDER",
    "BASE_PATH",
    "LOCAL_PHOTOS_PATH",
    "LOCAL_PHOTOS_BASE_URL",
    "SITE_URL",
    "SITE_NAME",
    "S3_BUCKET_NAME",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ];
  console.info("[afilmory] Resolved build configuration:");
  for (const key of keys) {
    const value = process.env[key];
    if (value === undefined || value === "") continue;
    console.info(`  ${key}=${SECRET_ENV_KEYS.has(key) ? "***" : value}`);
  }
}

function runBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["build"], {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm build exited with code ${code}`));
    });
  });
}

async function publishOutput(): Promise<void> {
  if (!existsSync(DIST_DIR)) {
    throw new Error(`Build produced no output directory at ${DIST_DIR}`);
  }
  await mkdir(OUTPUT_DIR, { recursive: true });
  // Clear existing contents without removing the (possibly mounted) directory.
  for (const entry of await readdir(OUTPUT_DIR)) {
    await rm(path.join(OUTPUT_DIR, entry), { recursive: true, force: true });
  }
  await cp(DIST_DIR, OUTPUT_DIR, { recursive: true });

  // Static hosts without SPA rewrites fall back to 404.html for unknown routes.
  const notFound = path.join(OUTPUT_DIR, "404.html");
  const index = path.join(OUTPUT_DIR, "index.html");
  if (!existsSync(notFound) && existsSync(index)) {
    await cp(index, notFound);
  }
  console.info(`[afilmory] Static site written to ${OUTPUT_DIR}`);
}

async function main(): Promise<void> {
  applyEnv(await loadConfigEnv());
  logResolvedConfig();
  await runBuild();
  await publishOutput();
}

main().catch((error: unknown) => {
  console.error(
    `[afilmory] Build failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
