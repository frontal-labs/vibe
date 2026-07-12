/** A `.vibe` diagnostic, re-anchored to source line/col. */
export interface Diagnostic {
  readonly code: string
  readonly severity: "error" | "warning" | "info"
  readonly line: number
  readonly col: number
  readonly message: string
  readonly help: string | null
}

/** The result of compiling `.vibe` to TypeScript. */
export interface CompileResult {
  readonly typescript: string
  readonly declarations: string
  readonly sourceMap: unknown
  readonly hasErrors: boolean
  readonly diagnostics: readonly Diagnostic[]
}

/** The result of type-checking `.vibe`. */
export interface CheckResult {
  readonly errorCount: number
  readonly warningCount: number
  readonly diagnostics: readonly Diagnostic[]
}

/**
 * The raw FFI surface exposed by the Rust compiler (napi addon or wasm module):
 * each returns a JSON string (or, for `format`, the formatted source). `@vibe/compiler`
 * wraps this into the typed API above. Inject a fake in tests.
 */
export interface CompilerBinding {
  compile(src: string): string
  check(src: string): string
  format(src: string): string
  version(): string
}

/** The typed compiler API the CLI and tools consume. */
export interface Compiler {
  compile(src: string): CompileResult
  check(src: string): CheckResult
  format(src: string): string
  version(): string
}
