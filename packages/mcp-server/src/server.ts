import { createServer, type Server as HttpServer } from "node:http"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import type { Logger } from "vibe/logger"
import { z } from "zod"
import { getPrompt, prompts } from "./prompts"
import { readResource, resources } from "./resources"
import { allTools } from "./tools"
import type { ToolContext, ToolSession } from "./types"

export interface StartOptions {
  readonly session: ToolSession
  readonly repoRoot: string
  readonly logger: Logger
  readonly transport?: "stdio" | "http"
  readonly port?: number
}

function ok(result: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
  }
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  }
}

/** Build (but don't connect) the MCP server and register all handlers. */
export function buildServer(options: StartOptions): Server {
  const server = new Server(
    { name: "vibe-mcp", version: "0.0.0" },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  )

  const ctx: ToolContext = {
    session: options.session,
    repoRoot: options.repoRoot,
    logger: options.logger,
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.schema, {
        target: "draft-2020-12",
      }) as Record<string, unknown>,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const tool = allTools.find((t) => t.name === name)
    if (!tool) return err(`Unknown tool: ${name}`)
    try {
      const parsed = tool.schema.parse(args ?? {})
      const result = await tool.execute(parsed, ctx)
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      mimeType: r.mimeType,
      description: r.description,
    })),
  }))

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const text = await readResource(request.params.uri, ctx)
      return {
        contents: [{ uri: request.params.uri, mimeType: "application/json", text }],
      }
    } catch (error) {
      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify({ error: String(error) }),
          },
        ],
        isError: true,
      }
    }
  })

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: prompts.map((p) => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments.map((a) => ({
        name: a.name,
        description: a.description,
        required: a.required,
      })),
    })),
  }))

  server.setRequestHandler(GetPromptRequestSchema, (request) => {
    try {
      return getPrompt(request.params.name, request.params.arguments, ctx)
    } catch (error) {
      return {
        description: "error",
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: String(error) },
          },
        ],
      }
    }
  })

  return server
}

/** Connect the server to stdio (default) or a streamable HTTP transport. */
export async function startServer(
  options: StartOptions,
): Promise<{ server: Server; close: () => void }> {
  const server = await buildServer(options)

  if (options.transport === "http") {
    const { transport, httpServer } = await createHttpTransport(options.port ?? 3000)
    await server.connect(transport)
    return {
      server,
      close: () => {
        httpServer.close()
      },
    }
  }

  const transport = new StdioServerTransport()
  await server.connect(transport)
  return { server, close: () => server.close() }
}

async function createHttpTransport(
  port: number,
): Promise<{ transport: StreamableHTTPServerTransport; httpServer: HttpServer }> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.method === "POST") {
      const chunks: Buffer[] = []
      req.on("data", (chunk: Buffer) => chunks.push(chunk))
      req.on("end", async () => {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined
        try {
          await transport.handleRequest(req, res, body)
        } catch (error) {
          res.writeHead(500).end(String(error))
        }
      })
    } else if (req.method === "GET" || req.method === "DELETE") {
      transport.handleRequest(req, res)
    } else {
      res.writeHead(405).end()
    }
  })

  await new Promise<void>((resolve) => httpServer.listen(port, resolve))
  return { transport, httpServer }
}
