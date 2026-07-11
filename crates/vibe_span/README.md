# vibe_span

Source files, spans, and positions for the Vibe compiler.

## Overview

`vibe_span` provides the foundational types for tracking source locations throughout the compiler. It defines:

- `FileId` — a unique identifier for each source file.
- `Span` — a half-open interval `[start, end)` within a file.
- `TextRange` — byte offsets used internally for slicing.
- `SourceFile` — the loaded text content associated with a `FileId`.

Every AST node, token, and diagnostic carries a `Span` so that tools can report errors, show hover text, and generate source maps.

## Dependencies

None. This crate has no external dependencies.

## Usage

`vibe_span` is a leaf dependency imported by virtually every other crate in the workspace. It is the first crate to build and provides the shared foundation for source-position tracking.
