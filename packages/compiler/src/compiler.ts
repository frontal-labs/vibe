import type { CheckResult, CompileResult, Compiler, CompilerBinding } from "./types"

/**
 * Wrap a raw `CompilerBinding` (napi/wasm) into the typed `Compiler` API, parsing
 * the FFI JSON into `CompileResult`/`CheckResult`. Pass a binding explicitly (the
 * loader supplies the native one by default).
 */
export function createCompiler(binding: CompilerBinding): Compiler {
  return {
    compile(src) {
      return JSON.parse(binding.compile(src)) as CompileResult
    },
    check(src) {
      return JSON.parse(binding.check(src)) as CheckResult
    },
    format(src) {
      return binding.format(src)
    },
    version() {
      return binding.version()
    },
  }
}
