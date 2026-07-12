import type { DockerfileOptions } from "./types"

/**
 * Generate a production Dockerfile for a Vibe agent app. Two-stage: install with
 * a frozen lockfile, then run the entry on Bun. `ANTHROPIC_API_KEY` is expected at
 * runtime (never baked in).
 */
export function generateDockerfile(options: DockerfileOptions = {}): string {
  const base = options.baseImage ?? "oven/bun:1-slim"
  const entry = options.entry ?? "dist/index.js"
  const port = options.port ?? 3000
  const envLines = Object.entries(options.env ?? {})
    .map(([key, value]) => `ENV ${key}=${value}`)
    .join("\n")

  return `# syntax=docker/dockerfile:1
FROM ${base} AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM ${base}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
${envLines ? `${envLines}\n` : ""}EXPOSE ${port}
ENV PORT=${port}
CMD ["bun", "${entry}"]
`
}

/** A matching `.dockerignore` so builds stay small. */
export function generateDockerignore(): string {
  const patterns = ["node_modules", "dist", ".git", ".turbo", "coverage", "*.log", ".env*"]
  return `${patterns.join("\n")}\n`
}
