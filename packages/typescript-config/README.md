# vibe/typescript-config

Shared TypeScript configuration presets for the Vibe monorepo.

## What it does

Provides base `tsconfig` presets (library, app, etc.) that other `vibe/*`
packages extend, keeping compiler options consistent across the monorepo. Has no
runtime `src` — it is configuration only. Not published separately; consumed via
`extends` in package `tsconfig.json` files.

## Install

Internal package — not published separately. Reference it from a `tsconfig.json`:

```json
{
  "extends": "vibe/typescript-config/base.json"
}
```
