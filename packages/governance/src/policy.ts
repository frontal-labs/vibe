/** What a policy decides for a given tool call. */
export type PolicyDecision = "allow" | "deny" | "require-approval"

/** The call being evaluated: which tool, its input, and (optionally) who's acting. */
export interface PolicyRequest {
  readonly tool: string
  readonly input: unknown
  readonly actor?: string
}

export interface Policy {
  readonly name: string
  evaluate(request: PolicyRequest): PolicyDecision | Promise<PolicyDecision>
}

/** The engine's ruling, naming the policy that produced a non-allow decision. */
export interface PolicyRuling {
  readonly decision: PolicyDecision
  readonly policy?: string
  readonly reason?: string
}

export interface PolicyEngine {
  evaluate(request: PolicyRequest): Promise<PolicyRuling>
}

/**
 * Combine policies into one engine. The strictest decision wins: any `deny` short-
 * circuits; otherwise a `require-approval` gates the call; only if every policy
 * allows does the call proceed.
 */
export function createPolicyEngine(policies: readonly Policy[]): PolicyEngine {
  return {
    evaluate: async (request) => {
      let approval: PolicyRuling | undefined
      for (const policy of policies) {
        const decision = await policy.evaluate(request)
        if (decision === "deny") {
          return { decision: "deny", policy: policy.name, reason: `Denied by "${policy.name}"` }
        }
        if (decision === "require-approval" && !approval) {
          approval = { decision: "require-approval", policy: policy.name }
        }
      }
      return approval ?? { decision: "allow" }
    },
  }
}

/** Allow only the named tools; everything else is denied. */
export function allowTools(names: readonly string[]): Policy {
  const set = new Set(names)
  return { name: "allowlist", evaluate: (r) => (set.has(r.tool) ? "allow" : "deny") }
}

/** Deny the named tools; everything else is allowed. */
export function denyTools(names: readonly string[]): Policy {
  const set = new Set(names)
  return { name: "denylist", evaluate: (r) => (set.has(r.tool) ? "deny" : "allow") }
}

/** Require human approval before the named tools run. */
export function requireApprovalFor(names: readonly string[]): Policy {
  const set = new Set(names)
  return {
    name: "approval-required",
    evaluate: (r) => (set.has(r.tool) ? "require-approval" : "allow"),
  }
}
