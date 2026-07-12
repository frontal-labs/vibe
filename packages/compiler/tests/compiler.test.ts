import { describe, expect, it, vi } from "vitest"

import { createCompiler } from "../src/compiler"
import type { CompilerBinding } from "../src/types"

const fakeBinding = (overrides: Partial<CompilerBinding> = {}): CompilerBinding => ({
  compile: () =>
    JSON.stringify({
      typescript: "export const x = 1",
      declarations: "declare const x: number",
      sourceMap: { version: 3 },
      hasErrors: false,
      diagnostics: [],
    }),
  check: () =>
    JSON.stringify({
      errorCount: 1,
      warningCount: 0,
      diagnostics: [
        { code: "VB2001", severity: "error", line: 4, col: 3, message: "bad", help: null },
      ],
    }),
  format: (src) => `formatted:${src}`,
  version: () => "0.0.0",
  ...overrides,
})

describe("createCompiler", () => {
  it("parses compile() JSON into a typed result", () => {
    const compiler = createCompiler(fakeBinding())
    const result = compiler.compile("agent A {}")
    expect(result.typescript).toBe("export const x = 1")
    expect(result.hasErrors).toBe(false)
    expect(result.sourceMap).toEqual({ version: 3 })
  })

  it("parses check() JSON with diagnostics", () => {
    const result = createCompiler(fakeBinding()).check("bad")
    expect(result.errorCount).toBe(1)
    expect(result.diagnostics[0]).toMatchObject({ code: "VB2001", line: 4, col: 3 })
  })

  it("passes format() through and reports version", () => {
    const compiler = createCompiler(fakeBinding())
    expect(compiler.format("x")).toBe("formatted:x")
    expect(compiler.version()).toBe("0.0.0")
  })

  it("forwards the source to the binding", () => {
    const compile = vi.fn(() =>
      JSON.stringify({
        typescript: "",
        declarations: "",
        sourceMap: null,
        hasErrors: false,
        diagnostics: [],
      }),
    )
    createCompiler(fakeBinding({ compile })).compile("SOURCE")
    expect(compile).toHaveBeenCalledWith("SOURCE")
  })
})
