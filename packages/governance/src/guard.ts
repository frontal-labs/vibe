import type { AnyTool } from "@vibe/tools"

import type { PolicyEngine, PolicyRequest } from "./policy"

export interface GuardOptions {
  /** Who is invoking the tool (threaded to policies for actor-based rules). */
  actor?: string
  /** Called when a policy requires approval; resolve `true` to allow the call. */
  onApproval?: (request: PolicyRequest) => boolean | Promise<boolean>
}

/**
 * Wrap a tool so every call is checked against the policy engine first. A `deny`
 * (or an unapproved `require-approval`) returns an error result the model can react
 * to — it never throws into the loop, so governance layers on without forking it.
 */
export function guardTool(
  tool: AnyTool,
  engine: PolicyEngine,
  options: GuardOptions = {},
): AnyTool {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    inputSchema: tool.inputSchema,
    execute: async (input, ctx) => {
      const request: PolicyRequest = { tool: tool.name, input, actor: options.actor }
      const ruling = await engine.evaluate(request)

      if (ruling.decision === "deny") {
        return { content: ruling.reason ?? `Tool "${tool.name}" is not permitted.`, isError: true }
      }
      if (ruling.decision === "require-approval") {
        const approved = options.onApproval ? await options.onApproval(request) : false
        if (!approved) {
          return {
            content: `Tool "${tool.name}" requires approval and was not approved.`,
            isError: true,
          }
        }
      }
      return tool.execute(input, ctx)
    },
  }
}
