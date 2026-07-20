# Release & Versioning

How Vibe versions and ships the `vibe/*` packages. The stack is
[Changesets](https://github.com/changesets/changesets) for versioning +
changelogs, conventional commits enforced by commitlint, and a Turborepo-driven
release script. This document is the source of truth for the flow and the policy —
and it calls out a config bug you must fix *before* trusting release automation.

Companion docs: [Contributing](../contributing/00-contributing.md),
[Testing strategy](./03-testing-strategy.md), [Roadmap](./00-roadmap.md#m6--10).

## The Changesets flow

Every user-facing change carries a changeset — a small markdown file describing the
change and the semver bump it warrants, per affected package.

1. **Make the change** on a branch, with tests and type-tests.
2. **Add a changeset:**
   ```bash
   bun changeset
   ```
   Pick the affected `vibe/*` packages, choose `patch` / `minor` / `major` for
   each, and write a human-readable summary. This writes a file under `.changeset/`
   that you commit alongside the code.
3. **Open the PR.** The changeset travels with it; reviewers see the intended bump.
4. **Version (release prep):**
   ```bash
   bun version   # → changeset version
   ```
   Consumes the pending changesets, bumps `package.json` versions, and updates each
   `CHANGELOG.md`. This is a release-prep step (typically its own PR or an automated
   one), never mixed into a feature PR.
5. **Publish:**
   ```bash
   bun release   # → turbo run build && changeset publish
   ```
   Builds every package through Turborepo, then publishes the newly-versioned ones
   to npm.

`.changeset/config.json` sets `"access": "public"` and
`"updateInternalDependencies": "patch"` — when one `vibe/*` package bumps, its
internal `workspace:*` dependents get at least a patch, so the graph stays
consistent.

### When a change needs a changeset

- **Needs one:** anything a consumer can observe — new/changed/removed exports,
  behavior changes, bug fixes, type-signature changes, dependency bumps that affect
  the published artifact.
- **Does not need one:** internal refactors with no surface change, test-only
  changes, docs, CI/tooling config. (These still go through the normal PR + CI gate.)

## Semver policy for the `vibe/*` monorepo

Packages are versioned **independently** — Changesets is not configured with
`fixed` or `linked` groups, so `vibe/agent` and `vibe/model` move on their own
cadence. The policy per package:

| Bump | Meaning | Examples |
|---|---|---|
| **major** | Breaking public API change | Remove/rename an export; change a factory's options shape; tighten a type in a source-breaking way; change error `code`s consumers branch on. |
| **minor** | Backward-compatible addition | New export, new optional option, new tool/provider capability, a new `AgentEvent` variant. |
| **patch** | Backward-compatible fix | Bug fix, internal perf, docs in the published README, dependency bump with no surface change. |

The **acyclic dependency graph** is a versioning contract, not just an architecture
one: because packages depend *down* (`shared` → … → `core`), a breaking change low
in the stack ripples up. Prefer additive changes in foundation packages; when a
breaking change is unavoidable there, expect coordinated majors up the chain and
say so in the changeset.

## Conventional commits + commitlint

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/),
enforced by commitlint (`commitlint.config.js` extends
`@commitlint/config-conventional`) via the `commit-msg` hook in
`.pre-commit-config.yaml`. Format:

```
type(scope): subject

feat(agent): add stream() emitting AgentEvent
fix(model): map 529 to OverloadedError
test(shared): migrate tsd assertions to expectAssignable
```

- **Common types:** `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`,
  `perf`, `build`, `ci`.
- **Scope** is the package name without the `vibe/` prefix (`agent`, `model`,
  `tools`, `core`, …). See the recent history (`feat(lifecycle): …`,
  `fix(plugin): …`) for the house style.
- **Breaking changes** get a `!` (`feat(model)!: …`) and/or a `BREAKING CHANGE:`
  footer.

Note the two systems are complementary, not redundant: conventional commits give
readable, machine-parseable history; **Changesets — not the commit type — drive the
actual version bump.** A `feat:` commit without a changeset ships no version change.

## Pre-1.0 stability expectations

All packages are at `0.x` today. Under `0.x`:

- **The public API is not yet stable.** Minor `0.x` releases may include breaking
  changes. Pin exact versions if you depend on Vibe before 1.0.
- Changesets still apply, and changelogs are still generated — you get a paper
  trail even while the surface moves.
- The bar for 1.0 (milestone [M6](./00-roadmap.md#m6--10)): `ask()` works end to
  end, the agentic layer is feature-complete through multi-agent, the public
  surface is reviewed, and release automation is proven on the default branch.

After 1.0, the semver table above becomes a hard contract: breaking changes only in
majors.

## The branch-trigger bug

Release automation is only as trustworthy as CI, and **CI is currently misconfigured
in a way that also endangers releases:**

- `.github/workflows/ci.yml` triggers on `push`/`pull_request` to **`main`** and on
  `v*` tags — but the repository's default branch is **`master`**. CI therefore
  never runs on normal pushes or PRs.
- `.changeset/config.json` sets `"baseBranch": "main"` — the wrong base for
  computing which packages changed.
- `packages/biome-config/biome.json` sets `vcs.defaultBranch: "main"` — the wrong
  base for Biome's changed-files awareness.

**Fix all three (`main` → `master`, or rename the branch to `main`) before relying
on `bun release`.** Until then: the `v*` tag trigger may fire, but PRs merge
without a green gate and Changesets diffs against a non-existent base. This is an
[M0 blocker](./00-roadmap.md#m0--base-is-stable); see also the
[current-state audit](../analysis/03-current-state-audit.md#-ci-never-runs-on-this-branch--and-main-is-assumed-in-four-places)
and [testing strategy](./03-testing-strategy.md#what-ci-runs).

Once fixed, the recommended shape is a Changesets "Version Packages" PR (opened
automatically when changesets land on the default branch) that, when merged, runs
`bun release` from CI — so publishing only ever happens from a green, tagged
default branch.
