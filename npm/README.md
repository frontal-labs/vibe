# npm distribution (templates)

Reference packages for shipping the Rust toolchain to npm, following the
`@biomejs/biome` / `@swc/core` model. **Not** part of the pnpm workspace (their
`optionalDependencies` point at per-platform packages produced by the release CI —
see [Phase R11](../docs/plan/05-language-implementation-plan.md)).

- **`vibe/`** — the `vibe` CLI launcher. Resolves the prebuilt `vibe_cli` binary
  from `@vibe/cli-<platform>-<arch>` and execs it.
- **`compiler/`** — `@vibe/compiler`. Loads the `vibe_napi` `.node` addon from
  `@vibe/compiler-<platform>-<arch>` and exposes `compile`/`check`/`version`.
- **`plugin/`** — `@vibe/plugin-build`, an esbuild/Vite/tsup plugin that compiles
  `.vibe` files in a bundler pipeline via `@vibe/compiler`.
