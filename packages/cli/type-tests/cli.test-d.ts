import type { Command } from "commander"
import { expectType } from "tsd"
import type { ProgramDeps } from "../src/index"
import { createProgram } from "../src/index"

declare const deps: ProgramDeps
expectType<Command>(createProgram(deps))
