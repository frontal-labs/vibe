import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { generateDockerfile } from "../src/dockerfile"

// docker/Dockerfile is a hand-maintained twin of generateDockerfile(); the two must
// emit the same instructions so the reference image and the generated one agree.
const instructions = (text: string) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "" && !line.trimStart().startsWith("#"))
    .map((line) => line.trim())

describe("docker/Dockerfile parity", () => {
  it("matches the generator's default instructions", () => {
    const reference = readFileSync(resolve(__dirname, "../../../docker/Dockerfile"), "utf8")
    expect(instructions(reference)).toEqual(instructions(generateDockerfile()))
  })
})
