import type { ToolContext } from "./types"

export interface McpPrompt {
  readonly name: string
  readonly description: string
  readonly arguments: readonly {
    readonly name: string
    readonly description: string
    readonly required: boolean
  }[]
}

export const prompts: readonly McpPrompt[] = [
  {
    name: "vibe/design-agent",
    description:
      "Design an agent plus its tools from a task description, following Vibe conventions.",
    arguments: [
      { name: "task", description: "What the agent should do.", required: true },
      {
        name: "constraints",
        description: "Optional constraints (model, effort, side-effect rules).",
        required: false,
      },
    ],
  },
  {
    name: "vibe/debug-run",
    description: "Explain a failed Vibe agent run or VibeError and suggest a fix.",
    arguments: [
      { name: "diagnostic", description: "The JSON result/error to debug.", required: true },
    ],
  },
  {
    name: "vibe/add-tool",
    description: "Scaffold and wire a new tool (or package + tool) into Vibe.",
    arguments: [
      { name: "tool", description: "What the tool should do.", required: true },
      {
        name: "package",
        description: "Package to add it to (scaffolds one if new).",
        required: false,
      },
    ],
  },
  {
    name: "vibe/scaffold-package",
    description: "Scaffold a new vibe/* package following repo conventions.",
    arguments: [{ name: "name", description: "Bare package name, e.g. 'cache'.", required: true }],
  },
] as const

/** Render a prompt into a user message the agent can act on. */
export function getPrompt(
  name: string,
  args: Record<string, unknown> | undefined,
  _ctx: ToolContext,
): { description: string; messages: { role: "user"; content: { type: "text"; text: string } }[] } {
  const a = args ?? {}
  switch (name) {
    case "vibe/design-agent":
      return {
        description: "Design a Vibe agent",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Design a Vibe agent that does: ${a.task}\n\nConstraints: ${a.constraints ?? "none"}\n\nProduce: (1) the agent's system prompt, (2) the tools it needs with Zod schemas, (3) where it fits in the vibe/* graph. Use vibe_dev_scaffold_agent / vibe_dev_scaffold_package to generate it.`,
            },
          },
        ],
      }
    case "vibe/debug-run":
      return {
        description: "Debug a Vibe run",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Debug this Vibe diagnostic and explain the likely cause, then suggest a fix:\n\n${JSON.stringify(a.diagnostic, null, 2)}`,
            },
          },
        ],
      }
    case "vibe/add-tool":
      return {
        description: "Add a Vibe tool",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Add a tool that does: ${a.tool}\n\nPackage: ${a.package ?? "decide based on the tool's concern"}\n\nScaffold it with vibe_dev_scaffold_package if the package is new, define the tool with a single Zod schema, register it, and run vibe_dev_check until green.`,
            },
          },
        ],
      }
    case "vibe/scaffold-package":
      return {
        description: "Scaffold a Vibe package",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Scaffold a new vibe/${a.name} package following repo conventions using vibe_dev_scaffold_package, then make bun run ci:check pass for it.`,
            },
          },
        ],
      }
    default:
      throw new Error(`Unknown prompt: ${name}`)
  }
}
