# config-app

How you build a **real** Vibe app: the Next.js-style convention layer. A
`vibe.config.ts` plus `agents/*.ts` and `tools/*.ts` (each default-exporting one),
auto-discovered — no manual registration.

```
config-app/
├── vibe.config.ts     # defineConfig({ name, provider, model })
├── agents/support.ts  # default-exports an agent (discovered → "support")
├── tools/get-order.ts # default-exports a tool  (discovered → "get-order")
└── src/index.ts       # discoverApp() + the agent→tool graph, then runs it
```

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/config-app start
```

What it shows:

- **`discoverApp(root)`** — resolves the config and scans `agents/`, `tools/`,
  `skills/`, `workflows/` into the build graph `@vibe/build` consumes.
- **`toolEdges(source)`** — the agent→tool import edges the optimizer code-splits
  into per-tool lazy chunks (small serverless cold starts). This is what the Rust
  `vibe_bundler` accelerates.

`vibe build` (from `@vibe/cli`) runs exactly this discovery + analysis to emit
optimized, tree-shaken, code-split bundles.
