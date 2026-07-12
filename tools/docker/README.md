# tools/docker

Reference container assets for Vibe agent apps. `Dockerfile` is a hand-maintained
twin of what `@vibe/deploy`'s `generateDockerfile()` emits per-project — keep them
in sync. `ANTHROPIC_API_KEY` is always provided at runtime, never built in.
