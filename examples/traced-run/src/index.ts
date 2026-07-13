import { createAgent } from "vibe/agent"
import { createAnthropicProvider } from "vibe/model"
import { createConsoleExporter, createTracer, traceAgentRun } from "vibe/tracing"

const agent = createAgent({ provider: createAnthropicProvider() })
const tracer = createTracer({ exporter: createConsoleExporter() })
const result = await traceAgentRun(agent, "Do something traceable.", tracer)
console.log("result:", result.text)
