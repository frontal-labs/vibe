# workflow

Durable, code-first workflows with `@vibe/workflows`: an ordered graph of `step`s
with `parallel` fan-out, checkpointed after every step so a failed run **resumes**
from where it stopped.

```sh
bun install
bun run --filter @example/workflow start
```

What it shows:

- **`defineWorkflow` / `step` / `parallel`** — each step's output feeds the next;
  `parallel` runs children concurrently and returns a record keyed by step id.
- **`ctx.steps`** — read any already-completed step's output by id.
- **Resume** — rerunning with the same `runId` + checkpoint store skips completed
  steps, so a transient failure recovers without redoing work. Also available:
  `conditional` (branching) and `mapOver` (per-item fan-out), plus per-step `retry`.
