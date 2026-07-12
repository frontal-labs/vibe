# Reference production image for a Vibe agent app (Bun). Two-stage: install then run.
# `@vibe/deploy`'s generateDockerfile() emits a per-project variant of this.
# syntax=docker/dockerfile:1
FROM oven/bun:1-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
ENV PORT=3000
# ANTHROPIC_API_KEY is supplied at runtime, never baked into the image.
CMD ["bun", "dist/index.js"]
