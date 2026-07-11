import {
  ProviderError,
  providerAuthError,
  providerRateLimitError,
  runtimeError,
  validationError,
} from "@vibe/errors"

/** Map an Anthropic HTTP status to a typed `@vibe/errors` error. */
export function mapAnthropicError(
  status: number | undefined,
  message: string,
  cause?: Error,
): Error {
  switch (status) {
    case 401:
    case 403:
      return providerAuthError(message, cause)
    case 429:
    case 529:
      return providerRateLimitError(message, cause)
    case 400:
      return validationError(message, cause)
    case 500:
      return runtimeError(message, cause)
    default:
      return cause instanceof ProviderError ? cause : runtimeError(message, cause)
  }
}
