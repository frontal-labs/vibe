# vibe/runtime

Execution engine, scheduling, retry, and resource management.

## What it does

`createRuntime`/`createExecutionEngine` run tasks with cancellation
(`createCancellationTokenSource`), scheduling (`createScheduler`), retry
(`executeWithRetry`, `defaultRetryPolicy`), and resource cleanup
(`createResourceManager`).

## Install

```sh
bun add vibe/runtime
```

## Usage

```ts
import { createRuntime, executeWithRetry, defaultRetryPolicy } from "vibe/runtime"

const runtime = createRuntime()
const out = await executeWithRetry(() => doWork(), defaultRetryPolicy)
```
