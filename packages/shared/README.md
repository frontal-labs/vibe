# vibe/shared

Shared internal utilities used across Vibe packages.

## What it does

Common helpers: type guards (`isDefined`, `isObject`, `assertNever`), a
`ContextStore`, branded types (`Brand`), `NativeAddon` loading, and the
published `VERSION`. Not published separately — consumed internally by other
`vibe/*` packages.

## Install

Internal package — not published separately. Imported as `vibe/shared` within the
monorepo.

## Usage

```ts
import { assertDefined, isString, VERSION } from "vibe/shared"

const name = assertDefined(maybeName)
if (isString(name)) console.log(VERSION)
```
