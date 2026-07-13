/** The kinds of PII the default redactor recognizes. */
export type PIIKind = "email" | "phone" | "credit-card" | "ssn" | "ip"

const PATTERNS: Record<PIIKind, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // 13–16 digit card numbers, optionally separated by spaces/hyphens.
  "credit-card": /\b(?:\d[ -]*?){13,16}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  phone: /\b(?:\+?\d{1,3}[ -]?)?(?:\(?\d{3}\)?[ -]?)\d{3}[ -]?\d{4}\b/g,
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
}

export interface RedactOptions {
  /** Which PII kinds to redact (default: all). */
  kinds?: readonly PIIKind[]
  /** Replacement token; the kind is appended, e.g. `[REDACTED:email]`. */
  token?: string
}

export interface RedactionResult {
  readonly text: string
  readonly redactions: Readonly<Record<PIIKind, number>>
}

/**
 * Redact PII from free text, returning the cleaned text plus per-kind counts.
 * Order matters — SSN and credit-card are checked before the looser phone pattern
 * so a card/SSN isn't mistaken for a phone number.
 */
export function redactPII(text: string, options: RedactOptions = {}): RedactionResult {
  const order: PIIKind[] = ["email", "ip", "credit-card", "ssn", "phone"]
  const kinds = options.kinds ?? order
  const token = options.token ?? "[REDACTED"
  const counts: Record<PIIKind, number> = {
    email: 0,
    phone: 0,
    "credit-card": 0,
    ssn: 0,
    ip: 0,
  }

  let out = text
  for (const kind of order) {
    if (!kinds.includes(kind)) continue
    out = out.replace(PATTERNS[kind], () => {
      counts[kind] += 1
      return `${token}:${kind}]`
    })
  }
  return { text: out, redactions: counts }
}

/** A reusable redactor bound to a set of options. */
export function createPIIRedactor(options: RedactOptions = {}) {
  return (text: string): RedactionResult => redactPII(text, options)
}
