import { expectType } from "tsd"
import type { EvalReport, Grader } from "../src/index"
import { exactMatch, runEval } from "../src/index"

expectType<Grader>(exactMatch())
expectType<Promise<EvalReport>>(
  runEval({
    cases: [{ name: "a", input: "x", expected: "x" }],
    run: () => "x",
    grader: exactMatch(),
  }),
)
