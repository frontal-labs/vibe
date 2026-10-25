# Claude Code Configuration for Vibe

This file provides Claude-specific configuration for working with the Vibe repository.

## Skill Configuration

Claude automatically loads skills from the `.claude/skills` directory, which is symlinked to the project's shared `skills` directory.

## Agent Guidelines

When working in this repository, follow these principles:

1. **Inspect first**: read the affected package and its tests before changing it. Packages depend
   only on the layers below them (see `docs/architecture/02-package-topology.md`); do not add an
   upward or cyclic dependency.
2. **Plan before coding** for anything that crosses packages: state the steps, then make them.
3. **Reuse existing patterns**: extend the established seam (`guardTool`/policies for governance,
   `runLoop` options for loop behavior, `createInMemory*` stores for persistence) instead of adding
   a parallel mechanism.
4. **Keep changes small and verifiable**: run the affected package's tests after each meaningful
   change, then the full suite before finishing.
5. **Keep docs in sync**: when behavior changes, update `docs/architecture/` in the same change.
   Do not describe a package as planned once it ships.
6. **Errors and logs**: library code throws typed errors from `vibe/errors` and logs through
   `vibe/logger`. No bare `throw new Error` or `console.log` in library code.

## Standard Workflow

1. **Explore**: read the relevant package with `Read`, and search with `Grep`/`Glob`. For broad
   questions, use the `Explore` agent.
2. **Plan**: list the implementation steps and decide how each will be tested.
3. **Implement**: one piece at a time. Use `Edit` for targeted changes.
4. **Validate**: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run format:check`.
   Run the package-scoped test (`bun run test --filter=<package>`) while iterating.
5. **Complete**: update docs, remove temporary files, and confirm every requirement is met.

Packages resolve each other through their built `dist`. After changing a package that others
import, run `bun run build` before typechecking or testing the dependents.

## Project Commands

- Install: `bun install`
- Build: `bun run build`
- Develop: `bun run dev`
- Test: `bun run test`
- Type check: `bun run typecheck`
- Lint: `bun run lint`
- Fix lint: `bun run lint:fix`
- Format: `bun run format`
- Check format: `bun run format:check`

## Rust/Cargo Commands (for native modules)

- Build Rust: `bun run cargo:build`
- Test Rust: `bun run cargo:test`
- Check Rust: `bun run cargo:check`
- Clippy: `bun run cargo:clippy`
- Format Rust: `bun run cargo:fmt`

## Commit Message Convention

Use conventional commits:
- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation changes
- `style:` for formatting changes
- `refactor:` for code restructuring
- `perf:` for performance improvements
- `test:` for test-related changes
- `chore:` for maintenance tasks

Include scope when relevant: `feat(auth): add JWT validation`

Provide motivation in commit body for non-obvious changes:
- What problem does this solve?
- Why was this approach chosen?
- What alternatives were considered?