import type { Agent } from "vibe/agent"
import type { Policy } from "vibe/governance"
import type { Effort, ModelId, ModelProvider } from "vibe/model"
import type { AnyEntity, OntologyStore } from "vibe/ontology"
import type { AnySkill } from "vibe/skills"
import type { AnyTool } from "vibe/tools"
import type { Workflow } from "vibe/workflows"

/** Governance: policies + which tools require human approval before running. */
export interface GovernanceConfig {
  readonly policies?: readonly Policy[]
  readonly requireApproval?: readonly string[]
  /** Enforce policies on system agents (default true). */
  readonly enforce?: boolean
}

/** Security: PII redaction, content guardrails, and per-actor rate limits. */
export interface SecurityConfig {
  readonly redactPII?: boolean
  readonly blockedTerms?: readonly string[]
  readonly rateLimit?: { readonly limit: number; readonly windowMs: number }
  /** Run content guardrails on tool inputs (default true when `security` is set). */
  readonly guardInputs?: boolean
  /** Enforce security controls on system agents (default true). */
  readonly enforce?: boolean
}

/** Observability: which cross-cutting signals to emit. */
export interface ObservabilityConfig {
  readonly metrics?: boolean
  readonly audit?: boolean
  readonly tracing?: boolean
  /** Auto-record metrics/audit on system agents (default true). */
  readonly enforce?: boolean
}

/** Ontology: the domain entity contracts + optional semantic store for grounding. */
export interface OntologyConfig {
  readonly entities?: readonly AnyEntity[]
  /** A semantic store; when set, agents gain a retrieve tool and prompt grounding. */
  readonly store?: OntologyStore
  /** RAG-style prompt grounding (default enabled, top-5) when a `store` is set. */
  readonly grounding?: { readonly enabled?: boolean; readonly limit?: number }
}

/** Build/optimizer options consumed by `vibe build`. */
export interface BuildOptions {
  /** Output directory for optimized bundles (default "dist"). */
  readonly outDir?: string
  /** Runtime target for cold-start tuning. */
  readonly target?: "node" | "bun" | "edge" | "cloudflare" | "vercel" | "lambda"
  /** Minify output (default true). */
  readonly minify?: boolean
  /** Lazily code-split each tool into its own chunk (default true) for minimal cold start. */
  readonly splitTools?: boolean
}

/**
 * A Vibe app's configuration — the typed shape of `vibe.config.ts`. Both a config
 * file and inline `vibe.system(...)` resolve to this. Agents/tools may be listed
 * explicitly here or auto-discovered from `agents/` and `tools/` (see `vibe/build`).
 */
export interface VibeConfig {
  /** App name. */
  readonly name: string
  /** A provider instance, or a provider name resolved at runtime (e.g. "anthropic"). */
  readonly provider?: ModelProvider | "anthropic" | (string & {})
  /** Default model id (autocompletes the catalog). */
  readonly model?: ModelId
  /** Default system prompt. */
  readonly system?: string
  /** Default reasoning effort. */
  readonly effort?: Effort
  /** Tools available to the app's agents (merged with auto-discovered `tools/`). */
  readonly tools?: AnyTool[]
  /** Named agents (merged with auto-discovered `agents/`). */
  readonly agents?: Readonly<Record<string, Agent>>
  /** Skills (code + markdown procedures), merged with auto-discovered `skills/`. */
  readonly skills?: readonly AnySkill[]
  /** Named workflows, merged with auto-discovered `workflows/`. */
  readonly workflows?: Readonly<Record<string, Workflow>>
  /** Domain ontology: entity contracts + (optionally) a semantic store. */
  readonly ontology?: OntologyConfig
  /** Governance policies + approval gates. */
  readonly governance?: GovernanceConfig
  /** Security controls: secrets, PII redaction, guardrails, rate limits. */
  readonly security?: SecurityConfig
  /** Observability: metrics, audit, tracing. */
  readonly observability?: ObservabilityConfig
  /** Build/optimizer options. */
  readonly build?: BuildOptions
}
