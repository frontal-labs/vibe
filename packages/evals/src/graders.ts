import type { GradeResult, Grader } from "./types"

const pass = (score = 1, detail?: string): GradeResult => ({ passed: score >= 1, score, detail })
const fail = (detail?: string): GradeResult => ({ passed: false, score: 0, detail })

/** Output must equal `expected` exactly (optionally trimmed/case-insensitive). */
export function exactMatch(options: { trim?: boolean; ignoreCase?: boolean } = {}): Grader {
  return (output, c) => {
    if (c.expected === undefined) return fail("no expected value")
    const norm = (s: string) => {
      let v = options.trim === false ? s : s.trim()
      if (options.ignoreCase) v = v.toLowerCase()
      return v
    }
    return norm(output) === norm(c.expected)
      ? pass()
      : fail(`expected "${c.expected}", got "${output}"`)
  }
}

/** Output must contain `expected` as a substring. */
export function includes(options: { ignoreCase?: boolean } = {}): Grader {
  return (output, c) => {
    if (c.expected === undefined) return fail("no expected value")
    const hay = options.ignoreCase ? output.toLowerCase() : output
    const needle = options.ignoreCase ? c.expected.toLowerCase() : c.expected
    return hay.includes(needle) ? pass() : fail(`"${c.expected}" not found in output`)
  }
}

/** Output must match a regexp (source taken from `expected` unless `pattern` given). */
export function regexMatch(pattern?: RegExp): Grader {
  return (output, c) => {
    const re = pattern ?? (c.expected ? new RegExp(c.expected) : undefined)
    if (!re) return fail("no pattern")
    return re.test(output) ? pass() : fail(`did not match ${re}`)
  }
}

/** Combine graders: passes only if all pass; score is the mean. */
export function all(...graders: Grader[]): Grader {
  return async (output, c) => {
    const results = await Promise.all(graders.map((g) => g(output, c)))
    const score = results.reduce((s, r) => s + r.score, 0) / (results.length || 1)
    const passed = results.every((r) => r.passed)
    return {
      passed,
      score,
      detail:
        results
          .map((r) => r.detail)
          .filter(Boolean)
          .join("; ") || undefined,
    }
  }
}
