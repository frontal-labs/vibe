import { expectAssignable, expectType } from "tsd"
import type { AgentLike } from "vibe/adapters"
import type { DeployPlan } from "../src/index"
import { deployPlan, generateDockerfile, toLambdaHandler, toVercelHandler } from "../src/index"

expectType<string>(generateDockerfile())
declare const agent: AgentLike
expectType<(request: Request) => Promise<Response>>(toVercelHandler(agent))
expectAssignable<(...args: never[]) => unknown>(toLambdaHandler)

// deployPlan turns a build manifest into a per-agent deploy plan.
expectType<DeployPlan>(
  deployPlan({ app: "x", target: "cloudflare", agents: {} }, { target: "cloudflare" }),
)
