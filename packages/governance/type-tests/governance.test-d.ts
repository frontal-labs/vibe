import { expectType } from "tsd"

import {
  allowTools,
  createPolicyEngine,
  denyTools,
  type Policy,
  type PolicyEngine,
  type PolicyRuling,
  requireApprovalFor,
} from "../src/index"

expectType<Policy>(allowTools(["search"]))
expectType<Policy>(denyTools(["delete"]))
expectType<Policy>(requireApprovalFor(["charge"]))

const engine = createPolicyEngine([denyTools(["delete"])])
expectType<PolicyEngine>(engine)
expectType<Promise<PolicyRuling>>(engine.evaluate({ tool: "delete", input: {} }))

// A policy request must name the tool.
// @ts-expect-error: `tool` is required
engine.evaluate({ input: {} })
