# Developer Experience Improvement Plan

## Overview
Vibe is a growing monorepo with many packages, tooling, and documentation. While the foundation is solid, several areas can be refined to improve developer onboarding, consistency, build performance, and maintainability without sacrificing scalability or production quality.

## Areas for Improvement

### 1. Package Granularity
**Issue:** The repository contains >30 small packages (e.g., `vibe/agent`, `vibe/model`, etc.). Many are tightly coupled, leading to a dense dependency graph and overhead in managing individual `package.json`, versioning, and changelogs.  
**Why it matters:** Increases cognitive load for contributors, slows down incremental builds (Turbo must schedule many tasks), and raises the chance of version mismatches.  
**Impact:** Faster rebuilds, simpler mental model, reduced maintenance overhead.  
**Action:** Group tightly related packages (e.g., `logger`, `errors`, `tracing`, `observability` into a single `vibe/observability` package; `di`, `lifecycle`, `config` into `vibe/core-infra`). Keep public API surface stable via internal re‑exports.

### 2. Barrel Exports (`index.ts`)
**Issue:** Most packages export everything via a barrel file (`src/index.ts`). This can hinder tree‑shaking and obscures which sub‑modules are actually used.  
**Why it matters:** Bundlers may include unused code; developers may inadvertently rely on deep internal paths that are not guaranteed stable.  
**Impact:** Smaller bundle sizes, clearer public API, easier to enforce encapsulation.  
**Action:** Replace barrel exports with explicit sub‑path exports in `package.json` (`exports` field) and remove or slim down `src/index.ts`. Encourage direct imports like `vibe/logger/formatter`.

### 3. Module Resolution Strategy
**Issue:** The repo relies on TypeScript path mappings in the root `tsconfig.json`. While functional, some tools (e.g., certain IDE features, non‑TS bundlers) may not resolve them correctly, and incremental type‑checking can be slower than with Project References.  
**Why it matters:** Improves IDE performance, enables faster incremental builds via `--build` mode, and provides better compatibility with diverse toolchains.  
**Impact:** Faster `tsc --noEmit` in watch mode, better refactoring support, more standard TS workflow.  
**Action:** Convert each package to use Project References (`"references": [{ "path": "./tsconfig.json" }]` in the root) and remove path mappings where possible. Keep root `tsconfig.json` as a composite.

### 4. Script Duplication
**Issue:** Many packages define their own `build`, `dev`, `test`, `typecheck` scripts (often just wrapping Turbo or Vitest). This leads to inconsistency and extra maintenance.  
**Why it matters:** When a script needs to change (e.g., updating Vitest version), each package must be updated.  
**Impact:** Centralized script updates, reduced boilerplate, enforce consistent flags across the repo.  
**Action:** Remove duplicated scripts from package.json and rely solely on Turbo filters (e.g., `turbo run build --filter=...`). Keep only package‑specific scripts (like generators) if needed.

### 5. Documentation Gaps
**Issue:** Some packages lack a README or have minimal guidance. Examples in `cookbooks/` and `examples/` may drift from the latest API.  
**Why it matters:** New contributors spend extra time discovering how to use a package; outdated examples cause confusion.  
**Impact:** Faster onboarding, reduced support burden, higher adoption of internal packages.  
**Action:** Ensure every package has a README with purpose, installation, and basic usage. Assign ownership to keep examples in sync with API changes (e.g., via CI checks that examples build).

### 6. Onboarding Complexity
**Issue:** New developers face a large repository with many moving parts (Rust crates, TypeScript packages, configs). The getting‑started guide assumes familiarity with the monorepo structure.  
**Why it matters:** Increases time to first contribution, discourages occasional contributors.  
**Impact:** Lower barrier to entry, higher contribution velocity.  
**Action:** Add a “Getting Started for Contributors” guide that clones the repo, installs deps, runs a quick end‑to‑end test (e.g., `bun run dev` in an example), and outlines where to find documentation for each domain (agents, tools, memory, etc.). Provide a script to bootstrap a minimal playground.

### 7. CI / Lint Consistency
**Issue:** While the root has lint and typecheck scripts, CI may not run them on every changed package (relying on Turbo’s caching). Ensure that lint, typecheck, and unit tests run on all PRs.  
**Why it matters:** Prevents style drift and type errors from slipping through.  
**Impact:** Higher code quality, fewer review comments about formatting or type issues.  
**Action:** Verify that `.github/workflows` (if present) or CI configuration runs `turbo run lint typecheck test` on `push` and `pull_request`. Add a check that `changeset` entries are present for version‑bump PRs.

### 8. Dependency Hygiene
**Issue:** With many packages, duplicate versions of the same dependency can appear (e.g., multiple versions of `zod`).  
**Why it matters:** Increases install size, may cause runtime conflicts, and wastes network I/O.  
**Impact:** Leaner `node_modules`, faster installs, predictable behavior.  
**Action:** Enable hoisting in the package manager (Bun/Yarn/npm workspaces already hoist by default) and run `npm dedupe` or `bun install --lock` regularly. Add a CI step that checks for duplicate versions (e.g., `madge --circular` or `npm ls`).

### 9. Example & Cookbook Freshness
**Issue:** Example projects in `examples/` and tutorials in `cookbooks/` may become outdated as the framework evolves.  
**Why it matters:** Users copy‑paste examples; if they break, trust erodes.  
**Impact:** Reliable learning resources, reduced support tickets.  
**Action:** Add a CI job that builds and runs each example/cookbook on each commit. Use a script to verify that they compile and start without errors.

### 10. Versioning & Release Automation
**Issue:** The project uses Changesets, which is good, but the release process still requires manual steps (`changeset version`, `changeset publish`).  
**Why it matters:** Manual steps increase release latency and chance of human error.  
**Impact:** Faster, more reliable releases.  
**Action:** Explore automating the release step in CI after `changeset version` passes (e.g., auto‑publish to npm when pushing to `main`). Keep manual oversight for pre‑release verification.

## Prioritized Roadmap
1. **Quick Wins (≤ 1 day each)**
   - Remove duplicate scripts from package.json, rely on Turbo.
   - Verify CI runs lint/type/test on all PRs.
   - Add duplicate‑dependency check to CI.
   - Ensure every package has a README (create missing ones).

2. **Short Term (1‑2 weeks)**
   - Consolidate tiny utility packages (logger, errors, tracing, etc.).
   - Replace barrel exports with explicit `exports` in `package.json` for consolidated packages.
   - Add contributor onboarding guide and bootstrap script.

3. **Medium Term (2‑4 weeks)**
   - Migrate to TypeScript Project References (update tsconfigs, test IDE performance).
   - Implement CI job to build/run all examples and cookbooks.
   - Review and update examples to match latest API.

4. **Long Term (ongoing)**
   - Monitor bundle sizes after barrel removal; adjust code‑splitting if needed.
   - Refine package boundaries based on usage patterns (may split or merge further).
   - Continuously improve documentation based on contributor feedback.

## Open Questions
- Should we keep the `vibe` barrel package (`@frontal-labs/vibe`) as a convenience wrapper, or deprecate it in favor of explicit imports?
- What is the preferred policy for exposing internal packages (e.g., `vibe/shared`)—should they remain public or be moved to internal scope?
- Are there any runtime performance constraints that would prevent package consolidation (e.g., lazy‑loading of optional features)?

---

This plan focuses on simplifier.