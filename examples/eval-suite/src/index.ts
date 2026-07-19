import { createAgent } from "@frontal-labs/vibe/agent"
import { includes, runEval } from "@frontal-labs/vibe/evals"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"

// A tiny eval: does the agent's answer contain the expected keyword?
const agent = createAgent({ provider: createAnthropicProvider() })

const report = await runEval({
  cases: [{ name: "capital", input: "Capital of France?", expected: "Paris" }],
  run: (input) => agent.run(input).then((r) => r.text),
  grader: includes(),
})

console.log(`pass rate: ${(report.passRate * 100).toFixed(0)}% (${report.passed}/${report.total})`)
