# Docker static-site builder

Afilmory can run as a **build-only** Docker container: give it a YAML config and
a folder of raw photos, and it writes a ready-to-serve static site to an output
directory. Serving (nginx, GitHub Pages, any static host) is handled downstream.

## Build the image

```bash
docker build -t afilmory-builder .
```

## Inputs and outputs

The container reads three bind mounts:

| Mount                 | Purpose                           | Default path        |
| --------------------- | --------------------------------- | ------------------- |
| `/config/config.yaml` | Build configuration (YAML)        | `AFILMORY_CONFIG`   |
| `/data/photos`        | Raw photo folder (local provider) | `LOCAL_PHOTOS_PATH` |
| `/output`             | Generated static site destination | `AFILMORY_OUTPUT`   |

The build runs `pnpm build` with `REQUIRE_FRESH_BUILD=true` and
`BUILDER_FAIL_ON_PHOTO_ERROR=true`, so any photo/manifest error fails the run
instead of shipping a partial site. The generated `apps/web/dist` is copied to
`/output`, and a `404.html` SPA fallback is added if the build did not emit one.

## Run (local provider)

```bash
docker run --rm \
  -v "$PWD/photos:/data/photos" \
  -v "$PWD/config.yaml:/config/config.yaml" \
  -v "$PWD/out:/output" \
  afilmory-builder
# Static site is now in ./out — serve it with any static host:
npx serve out
```

The container runs as root, so files in `./out` are root-owned; `sudo chown -R
"$(id -u):$(id -g)" out` if you need to edit them locally.

## Run (S3 provider)

Set `storage.provider: s3` in the config and pass credentials as environment
variables so they never live in the YAML file:

```bash
docker run --rm \
  -v "$PWD/config.yaml:/config/config.yaml" \
  -v "$PWD/out:/output" \
  -e S3_ACCESS_KEY_ID="$S3_KEY" \
  -e S3_SECRET_ACCESS_KEY="$S3_SECRET" \
  afilmory-builder
```

## Configuration

See [examples/config.example.yaml](../examples/config.example.yaml). Every key
maps to the environment variable the build already understands; a real
environment variable always overrides the file value.

| YAML key                                                                                      | Environment variable                                                                                                   |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `basePath`                                                                                    | `BASE_PATH`                                                                                                            |
| `photoLocationMode`                                                                           | `PHOTO_LOCATION_MODE`                                                                                                  |
| `site.name` / `.title` / `.description` / `.url` / `.language` / `.accentColor`               | `SITE_NAME` / `SITE_TITLE` / `SITE_DESCRIPTION` / `SITE_URL` / `SITE_LANGUAGE` / `SITE_ACCENT_COLOR`                   |
| `author.name` / `.url` / `.avatar`                                                            | `AUTHOR_NAME` / `AUTHOR_URL` / `AUTHOR_AVATAR`                                                                         |
| `social.github` / `.twitter` / `.rss` / `.home`                                               | `SOCIAL_GITHUB` / `SOCIAL_TWITTER` / `SOCIAL_RSS` / `SOCIAL_HOME`                                                      |
| `google_analytics`                                                                            | `GOOGLE_ANALYTICS_ID` (GA4 measurement ID, e.g. `G-XXXXXXXXXX`)                                                        |
| `feed.foloFeedId` / `.foloUserId`                                                             | `FEED_FOLO_FEED_ID` / `FEED_FOLO_USER_ID`                                                                              |
| `map.style` / `.projection` / `.mapboxToken`                                                  | `MAP_STYLE` / `MAP_PROJECTION` / `MAPBOX_TOKEN`                                                                        |
| `storage.provider`                                                                            | `PHOTO_STORAGE_PROVIDER` (`local` \| `s3`)                                                                             |
| `storage.local.photosPath` / `.baseUrl`                                                       | `LOCAL_PHOTOS_PATH` / `LOCAL_PHOTOS_BASE_URL`                                                                          |
| `storage.s3.bucket` / `.region` / `.endpoint` / `.prefix` / `.customDomain` / `.excludeRegex` | `S3_BUCKET_NAME` / `S3_REGION` / `S3_ENDPOINT` / `S3_PREFIX` / `S3_CUSTOM_DOMAIN` / `S3_EXCLUDE_REGEX`                 |
| `storage.s3.accessKeyId` / `.secretAccessKey`                                                 | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (prefer `-e`)                                                              |
| `license.sourceUrl` / `.correspondingSourceUrl` / `.licenseUrl` / `.requireExactSource`       | `AFILMORY_SOURCE_URL` / `AFILMORY_CORRESPONDING_SOURCE_URL` / `AFILMORY_LICENSE_URL` / `AFILMORY_REQUIRE_EXACT_SOURCE` |

### AGPL corresponding source

Afilmory is AGPL-3.0; a network-deployed site must link to its corresponding
source. The image bundles no `.git`, so the build cannot derive an exact commit
on its own. Set `license.correspondingSourceUrl` (or `-e
AFILMORY_CORRESPONDING_SOURCE_URL=...`) to a public archive/tree of the exact
source used to build the image to label the footer as exact. Without it the
build still succeeds but the footer is labeled non-exact. In CI you can instead
forward the runner's `GITHUB_REPOSITORY`/`GITHUB_SHA` (`-e GITHUB_REPOSITORY -e
GITHUB_SHA`) and set `license.requireExactSource: true` to enforce exactness.

### Relative / subpath deployments

`basePath` controls the deployment base. With `basePath: /photos`, assets,
thumbnails, originals, manifest shards, share links, and the PWA scope all
resolve under `/photos`, and photo detail pages are served at
`/<photo-id>/` (so the final URL is `example.com/photos/<photo-id>/`). Use
`basePath: /` for a root deployment.

## GitHub Actions usage

The container is published to Docker Hub as `gfrison/afilmory-builder:latest`
(on every push to `main`) and invoked
from the repository that holds the raw photos. Example workflow for that repo:

```yaml
name: Build and Deploy Photos
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - name: Build static gallery
        run: |
          docker run --rm \
            -v "$PWD/photos:/data/photos" \
            -v "$PWD/config.yaml:/config/config.yaml" \
            -v "$PWD/out:/output" \
            gfrison/afilmory-builder:latest
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

This replaces the repository's own `pnpm install` / manifest / `pnpm build`
steps with a single `docker run`.
