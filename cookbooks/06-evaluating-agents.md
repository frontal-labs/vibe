# Evaluating agents

```ts
import { includes, runEval } from "vibe/evals"

const report = await runEval({
  cases: [{ name: "capital", input: "Capital of France?", expected: "Paris" }],
  run: (input) => agent.run(input).then((r) => r.text),
  grader: includes(),
})
console.log(report.passRate) // 0..1
```

Graders: `exactMatch`, `includes`, `regexMatch`, and `all(...)` to combine.
Runnable: [`examples/eval-suite`](../examples/eval-suite).
