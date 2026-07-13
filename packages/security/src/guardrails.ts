export interface GuardResult {
  readonly ok: boolean
  readonly matches: readonly string[]
}

export interface ContentGuardOptions {
  /** Case-insensitive substrings that fail the check (e.g. blocked terms). */
  blocked?: readonly string[]
  /** Regex patterns that fail the check (e.g. prompt-injection markers). */
  patterns?: readonly RegExp[]
}

// Common prompt-injection tells, on by default.
const DEFAULT_INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) (instructions|prompts)/i,
  /disregard (the )?(system|previous) (prompt|instructions)/i,
  /you are now (a |an )?(dan|developer mode|unrestricted)/i,
]

/**
 * A content guard for tool inputs/outputs and user text. Flags blocked terms and
 * injection patterns; use it at hook points to reject or sanitize before the model
 * or a tool sees the content.
 */
export function createContentGuard(options: ContentGuardOptions = {}) {
  const blocked = (options.blocked ?? []).map((b) => b.toLowerCase())
  const patterns = [...DEFAULT_INJECTION_PATTERNS, ...(options.patterns ?? [])]

  return {
    check(text: string): GuardResult {
      const matches: string[] = []
      const lower = text.toLowerCase()
      for (const term of blocked) {
        if (lower.includes(term)) matches.push(term)
      }
      for (const pattern of patterns) {
        const found = pattern.exec(text)
        if (found) matches.push(found[0])
      }
      return { ok: matches.length === 0, matches }
    },
  }
}
