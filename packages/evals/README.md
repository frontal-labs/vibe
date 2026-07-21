# vibe/evals

Evaluate agent outputs against graders and produce reports.

## What it does

Run individual eval cases (`runEval`) and grade outputs with built-in graders
(`exactMatch`, `includes`, `regexMatch`, `all`). Defines the `EvalCase`,
`EvalSuite`, `EvalReport`, and `Grader` types for reproducible evaluation.

## Install

```sh
bun add vibe/evals
```

## Usage

```ts
import { runEval, exactMatch } from "vibe/evals"

const report = await runEval({
  case: { input: "hi", expected: "hello" },
  run: async (input) => model.complete(input),
  grader: exactMatch,
})
```
