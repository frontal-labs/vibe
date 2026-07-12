import { createLogger, LogLevel } from "@vibe/logger"

import { resolveRepoRoot } from "./lib/path"
import { startServer } from "./server"
import { Session } from "./session"

async function main(): Promise<void> {
  const logger = createLogger({ level: LogLevel.Info, defaultMeta: { system: "vibe-mcp" } })
  const repoRoot = resolveRepoRoot(process.cwd())
  const session = new Session(repoRoot, logger)

  const transport = process.env.VIBE_MCP_TRANSPORT === "http" ? "http" : "stdio"
  const port = process.env.VIBE_MCP_PORT ? Number(process.env.VIBE_MCP_PORT) : 3000

  const { close } = await startServer({ session, repoRoot, logger, transport, port })
  logger.info("vibe-mcp ready", { transport, port, repoRoot })

  const shutdown = async (): Promise<void> => {
    logger.info("vibe-mcp shutting down")
    close()
    await session.stop()
    process.exit(0)
  }
  const onSignal = () => {
    shutdown().catch(() => process.exit(1))
  }
  process.on("SIGINT", onSignal)
  process.on("SIGTERM", onSignal)
}

main().catch((_error) => {
  process.exit(1)
})
