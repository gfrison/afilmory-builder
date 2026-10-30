# syntax=docker/dockerfile:1

# Debian (glibc) base: sharp's prebuilt libvips and the vendored ExifTool need
# glibc + Perl, which Alpine/musl does not provide out of the box.
FROM node:22-bookworm-slim

# exiftool-vendored ships a Perl ExifTool distribution that requires Perl.
RUN apt-get update \
  && apt-get install -y --no-install-recommends perl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

WORKDIR /app

# Workspace packages run from TS source, so a frozen install is all that is
# needed; there is no per-package dist build step.
COPY . .
RUN pnpm install --frozen-lockfile

# Inputs are provided at runtime via bind mounts:
#   /config/config.yaml  build configuration (YAML)
#   /data/photos         raw photo folder (local provider)
#   /output              destination for the generated static site
ENTRYPOINT ["pnpm", "exec", "tsx", "scripts/docker/entrypoint.ts"]
