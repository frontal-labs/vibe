import {
  ProviderError,
  providerAuthError,
  providerRateLimitError,
  runtimeError,
  validationError,
} from "vibe/errors"

/** Map an OpenAI-compatible HTTP status to a typed `vibe/errors` error. */
export function mapOpenAIError(status: number | undefined, message: string, cause?: Error): Error {
  switch (status) {
    case 401:
    case 403:
      return providerAuthError(message, cause)
    case 429:
      return providerRateLimitError(message, cause)
    case 400:
    case 422:
      return validationError(message, cause)
    default:
      if (status !== undefined && status >= 500) return runtimeError(message, cause)
      return cause instanceof ProviderError ? cause : runtimeError(message, cause)
  }
}
