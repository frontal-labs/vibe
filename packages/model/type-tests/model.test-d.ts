import { expectAssignable, expectType } from "tsd"
import type {
  AnthropicParams,
  Effort,
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../src/index"
import { createFakeProvider, DEFAULT_MODEL, toAnthropicParams } from "../src/index"

expectType<"claude-opus-4-8">(DEFAULT_MODEL)

expectAssignable<Effort>("low")
expectAssignable<Effort>("max")

const provider = createFakeProvider([{ content: [{ type: "text", text: "x" }] }])
expectAssignable<ModelProvider>(provider)

const req: ModelRequest = { model: DEFAULT_MODEL, messages: [{ role: "user", content: "hi" }] }
expectType<Promise<ModelResponse>>(provider.generate(req))
expectType<AnthropicParams>(toAnthropicParams(req))
