import { expectType } from "tsd"
import type { CheckResult, CompileResult, CompilerBinding } from "../src/index"
import { createCompiler } from "../src/index"

declare const binding: CompilerBinding
const compiler = createCompiler(binding)
expectType<CompileResult>(compiler.compile("x"))
expectType<CheckResult>(compiler.check("x"))
expectType<string>(compiler.format("x"))
