import type { AgentLike } from "@vibe/adapters"
import { expectType } from "tsd"
import { generateDockerfile, toLambdaHandler, toVercelHandler } from "../src/index"

expectType<string>(generateDockerfile())
declare const agent: AgentLike
expectType<(request: Request) => Promise<Response>>(toVercelHandler(agent))
expectType<"function">(typeof toLambdaHandler)
