# vibe_diagnostics

Diagnostic types, error codes, and severity definitions for the `.vibe` compiler.

## Overview

`vibe_diagnostics` defines the structured error and warning types used throughout the compiler. It includes the `VBxxxx` diagnostic codes, severity levels, and source-anchored message formatting.

## Dependencies

- [`vibe_span`](../vibe_span) — source positions so every diagnostic can point to the exact file and range.

## Usage

Every compiler phase that needs to report an error or warning emits diagnostics through this crate. The CLI and LSP consume them to present user-friendly messages.
