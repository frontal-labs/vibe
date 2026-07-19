# Tracing & observability

```ts
import { createTracer, createConsoleExporter, traceAgentRun } from "@frontal-labs/vibe/tracing"

const tracer = createTracer({ exporter: createConsoleExporter() })
const result = await traceAgentRun(agent, "Do the thing.", tracer)
```

You get a root span for the run plus one span per iteration and per tool call.
Swap the exporter for an OTLP sink in production. Runnable:
[`examples/traced-run`](../examples/traced-run).
