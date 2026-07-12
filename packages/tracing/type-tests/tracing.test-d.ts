import { expectType } from "tsd"
import type { ActiveSpan, Span } from "../src/index"
import { createTracer } from "../src/index"

const tracer = createTracer()
const span = tracer.startSpan("x")
expectType<ActiveSpan>(span)
expectType<Span>(span.end())
