import { z } from "zod"

import type { McpTool } from "../types"

/** `vibe.runtime.*` — operate a running Vibe system: run agents, inspect tools. */
export const runtimeTools: McpTool[] = [
  {
    name: "vibe_runtime_ask",
    description:
      "Run the Vibe agent loop with a prompt and return the assistant's final text, iteration count, and token usage. Requires a configured model provider (ANTHROPIC_API_KEY).",
    schema: z.object({
      prompt: z.string().describe("The user prompt to send to the agent."),
      system: z.string().optional().describe("Optional system prompt override."),
      model: z
        .string()
        .optional()
        .describe("Optional model id override (default claude-opus-4-8)."),
      maxIterations: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard ceiling on model round-trips (default 10)."),
    }),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(args, ctx) {
      return ctx.session.runAgent(args.prompt, {
        system: args.system,
        model: args.model,
        maxIterations: args.maxIterations,
      })
    },
  },

  {
    name: "vibe_runtime_run",
    description:
      "Run a Vibe agent with explicit controls (system prompt, model, tool allow-list, max iterations) and return a structured result.",
    schema: z.object({
      prompt: z.string().describe("The user prompt to send to the agent."),
      system: z.string().optional().describe("Optional system prompt."),
      model: z.string().optional().describe("Optional model id override."),
      toolNames: z
        .array(z.string())
        .optional()
        .describe("Restrict the agent to these tool names. Omit to allow all seeded tools."),
      maxIterations: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Hard ceiling on model round-trips."),
    }),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(args, ctx) {
      return ctx.session.runAgent(args.prompt, {
        system: args.system,
        model: args.model,
        toolNames: args.toolNames,
        maxIterations: args.maxIterations,
      })
    },
  },

  {
    name: "vibe_runtime_seed_tools",
    description:
      "Register the built-in operator tools (read_file, list_dir, run_command) into the agent's tool registry so the agent loop can operate the workspace. Idempotent.",
    schema: z.object({}),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(_args, ctx) {
      ctx.session.registerBuiltinTools()
      return { tools: ctx.session.listTools() }
    },
  },

  {
    name: "vibe_runtime_list_tools",
    description: "List the tools currently available to the agent (built-in + any registered).",
    schema: z.object({}),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(_args, ctx) {
      return { tools: ctx.session.listTools() }
    },
  },

  {
    name: "vibe_runtime_get_tool",
    description: "Get a tool's description and JSON input schema by name.",
    schema: z.object({
      name: z.string().describe("The tool name, e.g. 'read_file'."),
    }),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(args, ctx) {
      const tool = ctx.session.getTool(args.name)
      if (!tool) {
        return { error: `Unknown tool: "${args.name}"`, found: false }
      }
      return { found: true, ...tool }
    },
  },

  {
    name: "vibe_runtime_status",
    description:
      "Report the live Vibe system status: repo root, provider id, tool count, and lifecycle/version info.",
    schema: z.object({}),
    // biome-ignore lint/suspicious/useAwait: interface requires Promise return
    async execute(_args, ctx) {
      return ctx.session.status()
    },
  },
]
