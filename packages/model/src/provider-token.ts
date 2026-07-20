import { createToken } from "vibe/di"

import type { ModelProvider } from "./types"

/** DI token the agent loop resolves the model provider by. */
export const modelProviderToken = createToken<ModelProvider>("model.provider")
