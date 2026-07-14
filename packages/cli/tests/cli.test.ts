import { join } from "node:path"
import type { BuildManifest } from "@vibe/build"
import { describe, expect, it } from "vitest"

import { summarizeManifest } from "../src/actions"
import { createProgram } from "../src/program"

const fakeManifest: BuildManifest = {
  app: "test-app",
  target: "node",
  agents: {
    alpha: { name: "alpha", entry: "alpha.js", bytes: 2048, chunks: ["chunk-x.js"], tools: [] },
  },
  skills: {},
  workflows: {},
  chunks: ["chunk-x.js"],
  totalBytes: 4096,
}

describe("summarizeManifest", () => {
  it("summarizes agents, chunks and size", () => {
    const s = summarizeManifest(fakeManifest)
    expect(s).toContain("1 agent(s)")
    expect(s).toContain("1 shared chunk(s)")
    expect(s).toContain("KB total")
  })
})

describe("createProgram", () => {
  it("build calls the injected builder and prints a summary", async () => {
    const lines: string[] = []
    let builtDir: string | undefined
    const program = createProgram({
      build: (dir) => {
        builtDir = dir
        return fakeManifest
      },
      templatesDir: join(__dirname, "fixtures"),
      log: (l) => lines.push(l),
    })
    await program.parseAsync(["node", "vibe", "build", "myapp"])
    expect(builtDir).toBe("myapp")
    expect(lines.some((l) => l.includes("1 agent(s)"))).toBe(true)
  })

  it("build --analyze also prints per-agent sizes", async () => {
    const lines: string[] = []
    const program = createProgram({
      build: () => fakeManifest,
      templatesDir: join(__dirname, "fixtures"),
      log: (l) => lines.push(l),
    })
    await program.parseAsync(["node", "vibe", "build", ".", "--analyze"])
    expect(lines.join("\n")).toContain("test-app")
    expect(lines.join("\n")).toContain("alpha")
  })
})
