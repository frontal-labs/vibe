# vibe/errors

Structured error types and factories for Vibe.

## What it does

Defines the base `VibeError` and a family of domain errors (`ToolError`,
`ProviderError`, `ConfigError`, `ValidationError`, `TimeoutError`, and more),
plus factories (`toolError`, `configError`, `withHint`) and
`formatDiagnostic` for rich, serializable error output.

## Install

```sh
bun add vibe/errors
```

## Usage

```ts
import { toolError, formatDiagnostic, ErrorCode } from "vibe/errors"

throw toolError("call failed", { code: ErrorCode.TOOL_FAILED })
console.log(formatDiagnostic(err))
```
