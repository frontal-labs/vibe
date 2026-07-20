import { createAgent } from "@frontal-labs/vibe/agent"
import { createAnthropicProvider } from "@frontal-labs/vibe/model"
import { createConsoleExporter, createTracer, traceAgentRun } from "@frontal-labs/vibe/tracing"

const agent = createAgent({ provider: createAnthropicProvider() })
const tracer = createTracer({ exporter: createConsoleExporter() })
const result = await traceAgentRun(agent, "Do something traceable.", tracer)
console.log("result:", result.text)
