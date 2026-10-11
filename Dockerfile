# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM oven/bun:1.4.2-alpine AS build
WORKDIR /src

# Install dependencies first so this layer is reused until a manifest changes.
COPY package.json bun.lock ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build


FROM oven/bun:1.4.2-alpine

LABEL org.opencontainers.image.title="Mewte" \
      org.opencontainers.image.description="Marks GitHub notifications as done according to your rules" \
      org.opencontainers.image.source="https://github.com/BlackHole1/Mewte"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    DATABASE_URL=sqlite:///data/mewte.db \
    WEB_DIST=/app/public

WORKDIR /app

# The server is one self-contained bundle, so the image needs no node_modules.
COPY --from=build /src/apps/server/dist ./dist
COPY --from=build /src/apps/web/dist ./public

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r = await fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).catch(() => null); process.exit(r?.ok ? 0 : 1)"]

CMD ["bun", "dist/index.mjs"]
