# eval-suite

Run an agent against eval cases and report a pass rate with `@vibe/evals`.

```sh
bun install
ANTHROPIC_API_KEY=sk-... bun run --filter @example/eval-suite start
```

`runEval({ cases, run, grader })` scores each case with a grader — `includes`,
`exactMatch`, `regexMatch`, or `all(...)` to combine them — and returns pass/total
plus a pass rate. Graders are provider-agnostic — point `run` at any agent to benchmark its behavior.
