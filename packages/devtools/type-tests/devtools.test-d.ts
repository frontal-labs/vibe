import { expectType } from "tsd"

import { type CostBreakdown, estimateCost, formatUsage } from "../src/index"

expectType<CostBreakdown>(estimateCost({ inputTokens: 1, outputTokens: 1 }, "claude-opus-4-8"))
expectType<string>(formatUsage({ inputTokens: 1, outputTokens: 1 }))
