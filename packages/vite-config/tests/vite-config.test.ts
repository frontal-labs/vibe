import { describe, expect, it } from "vitest"
import { createBaseConfig } from "../src/index"

describe("createBaseConfig", () => {
  it("returns an object with expected shape", () => {
    const config = createBaseConfig()
    expect(config).toBeInstanceOf(Object)
    expect(config).toHaveProperty("build")
    expect(config).toHaveProperty("resolve")
  })

  it("defaults entry to src/index.ts", () => {
    const config = createBaseConfig()
    expect(config.build!.lib!.entry).toBe("src/index.ts")
  })

  it("accepts a custom entry override", () => {
    const config = createBaseConfig("src/cli.ts")
    expect(config.build!.lib!.entry).toBe("src/cli.ts")
  })

  it("sets build.target to node20", () => {
    const config = createBaseConfig()
    expect(config.build!.target).toBe("node20")
  })

  it("sets build.lib.formats to es and cjs", () => {
    const config = createBaseConfig()
    expect(config.build!.lib!.formats).toEqual(["es", "cjs"])
  })

  it("sets build.outDir to dist", () => {
    const config = createBaseConfig()
    expect(config.build!.outDir).toBe("dist")
  })

  it("sets build.sourcemap to true", () => {
    const config = createBaseConfig()
    expect(config.build!.sourcemap).toBe(true)
  })

  it("contains resolve.alias as an object", () => {
    const config = createBaseConfig()
    const alias = config.resolve!.alias as Record<string, string>
    expect(alias).toBeInstanceOf(Object)
    for (const [key, value] of Object.entries(alias)) {
      expect(key).toMatch(/^vibe\//)
      expect(value).toBeTruthy()
    }
  })

  describe("rollupOptions.external", () => {
    const external = (id: string) => {
      const config = createBaseConfig()
      return (config.build!.rollupOptions!.external as (id: string) => boolean)(id)
    }

    it("returns true for node: builtins", () => {
      expect(external("node:fs")).toBe(true)
      expect(external("node:path")).toBe(true)
      expect(external("node:crypto")).toBe(true)
      expect(external("node:stream")).toBe(true)
      expect(external("node:events")).toBe(true)
      expect(external("node:util")).toBe(true)
    })

    it("returns true for vibe/* packages listed in the registry", () => {
      expect(external("@@vibe/agent")).toBe(true)
      expect(external("@@vibe/core")).toBe(true)
      expect(external("@@vibe/shared")).toBe(true)
      expect(external("@@vibe/logger")).toBe(true)
      expect(external("@@vibe/config")).toBe(true)
    })

    it("returns true for known third-party dependencies", () => {
      expect(external("zod")).toBe(true)
      expect(external("@anthropic-ai/sdk")).toBe(true)
      expect(external("esbuild")).toBe(true)
      expect(external("handlebars")).toBe(true)
      expect(external("chokidar")).toBe(true)
      expect(external("commander")).toBe(true)
      expect(external("@standard-schema/spec")).toBe(true)
    })

    it("returns true for sub-paths of external dependencies", () => {
      expect(external("zod/errors")).toBe(true)
      expect(external("@anthropic-ai/sdk/cli")).toBe(true)
      expect(external("@@vibe/agent/tools")).toBe(true)
    })

    it("returns false for relative imports", () => {
      expect(external("./foo")).toBe(false)
      expect(external("../bar")).toBe(false)
      expect(external("./utils/helpers")).toBe(false)
      expect(external("../../shared/utils")).toBe(false)
    })

    it("returns false for regular source imports", () => {
      expect(external("some-local-module")).toBe(false)
      expect(external("another-package")).toBe(false)
    })
  })

  describe("entryFileNames", () => {
    const getEntryFileNames = () => {
      const config = createBaseConfig()
      return config.build!.rollupOptions!.output as {
        entryFileNames: (chunk: { name: string }, format: string) => string
      }
    }

    it("uses .js extension for es format", () => {
      const output = getEntryFileNames()
      expect(output.entryFileNames({ name: "index" }, "es")).toBe("index.js")
    })

    it("uses .cjs extension for cjs format", () => {
      const output = getEntryFileNames()
      expect(output.entryFileNames({ name: "index" }, "cjs")).toBe("index.cjs")
    })
  })
})
