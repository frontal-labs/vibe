import type {
  GovernanceConfig,
  ObservabilityConfig,
  OntologyConfig,
  SecurityConfig,
} from "vibe/config"
import type { LogLevel } from "vibe/logger"
import type { CheckpointStore, Memory } from "vibe/memory"
import type { Effort, ModelProvider } from "vibe/model"
import type { Plugin } from "vibe/plugin"
import type { AnySkill } from "vibe/skills"
import type { AnyTool } from "vibe/tools"
import type { Workflow } from "vibe/workflows"

export interface SystemConfig {
  name: string
  logLevel?: LogLevel
  plugins?: Plugin[]
  /** The model provider backing `ask()` / the default agent. */
  provider?: ModelProvider
  /** Default model id for the system's agent (defaults to `claude-opus-4-8`). */
  model?: string
  /** Default system prompt for the system's agent. */
  system?: string
  /** Default reasoning effort. */
  effort?: Effort
  /** Tools available to the default agent. */
  tools?: AnyTool[]
  /** Skills (code + markdown), registered into the tool registry. */
  skills?: readonly AnySkill[]
  /** Named workflows exposed on `system.workflows`. */
  workflows?: Readonly<Record<string, Workflow>>
  /** Domain ontology: entity contracts + a semantic store. */
  ontology?: OntologyConfig
  /** Governance policies + approval gates. */
  governance?: GovernanceConfig
  /** Security controls: PII redaction, guardrails, rate limits, secrets. */
  security?: SecurityConfig
  /** Observability: metrics, audit, tracing. */
  observability?: ObservabilityConfig
  /**
   * Where conversations live for runs that pass `conversationId`. Defaults to an in-process store;
   * pass a durable one (e.g. `createFileMemory`) for conversations that survive restarts.
   */
  memory?: Memory
  /**
   * Where run checkpoints live for runs that pass `runId`. Without one, `runId` is an error.
   */
  checkpointStore?: CheckpointStore
}

/** Per-call options for `system.ask()`. */
export interface AskOptions {
  /** Continue the persisted conversation with this id (see `SystemConfig.memory`). */
  conversationId?: string
  /** Make the run resumable under this id (requires `SystemConfig.checkpointStore`). */
  runId?: string
}

export interface SystemInfo {
  name: string
  version: string
  state: string
  uptimeMs: number
  pluginCount: number
}
