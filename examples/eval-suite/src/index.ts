import { createAgent } from "@vibe/agent"
import { includes, runEval } from "@vibe/evals"
import { createFakeProvider } from "@vibe/model"

// A tiny offline eval: does the agent's answer contain the expected keyword?
const agent = createAgent({
  provider: createFakeProvider([{ content: [{ type: "text", text: "The capital is Paris." }] }]),
})

const report = await runEval({
  cases: [{ name: "capital", input: "Capital of France?", expected: "Paris" }],
  run: (input) => agent.run(input).then((r) => r.text),
  grader: includes(),
})

console.log(`pass rate: ${(report.passRate * 100).toFixed(0)}% (${report.passed}/${report.total})`)
