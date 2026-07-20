import type {
  GovernanceConfig,
  ObservabilityConfig,
  OntologyConfig,
  SecurityConfig,
} from "vibe/config"
import { createPolicyEngine, type PolicyEngine, requireApprovalFor } from "vibe/governance"
import type { Logger } from "vibe/logger"
import { type AuditLog, createAuditLog, createMetrics, type Metrics } from "vibe/observability"
import {
  createEntityRegistry,
  createInMemoryOntologyStore,
  type EntityRegistry,
  type OntologyStore,
} from "vibe/ontology"
import {
  type ContentGuardOptions,
  createContentGuard,
  createEnvSecrets,
  createRateLimiter,
  type RateLimiter,
  redactPII,
  type SecretsProvider,
} from "vibe/security"
import { type AnySkill, createSkillRegistry, type SkillRegistry } from "vibe/skills"
import type { AnyTool, ToolRegistry } from "vibe/tools"
import type { Workflow } from "vibe/workflows"

/** Security services derived from the app's `security` config. */
export interface SecurityServices {
  /** Redact PII from text (identity when redaction is disabled). */
  redact(text: string): string
  guard: ReturnType<typeof createContentGuard>
  rateLimiter?: RateLimiter
  secrets: SecretsProvider
}

/** Observability services — always present so callers can record unconditionally. */
export interface ObservabilityServices {
  metrics: Metrics
  audit: AuditLog
  tracing: boolean
}

/** Ontology services: the entity contract registry + the semantic store. */
export interface OntologyServices {
  entities: EntityRegistry
  store: OntologyStore
}

/** The bundle of enterprise services a `System` exposes. */
export interface EnterpriseServices {
  governance: PolicyEngine
  security: SecurityServices
  observability: ObservabilityServices
  ontology: OntologyServices
  skills: SkillRegistry
  workflows: Readonly<Record<string, Workflow>>
}

export interface EnterpriseConfig {
  governance?: GovernanceConfig
  security?: SecurityConfig
  observability?: ObservabilityConfig
  ontology?: OntologyConfig
  skills?: readonly AnySkill[]
  workflows?: Readonly<Record<string, Workflow>>
}

function buildGovernance(config: GovernanceConfig | undefined): PolicyEngine {
  const policies = [...(config?.policies ?? [])]
  if (config?.requireApproval?.length) {
    policies.push(requireApprovalFor(config.requireApproval))
  }
  return createPolicyEngine(policies)
}

function buildSecurity(config: SecurityConfig | undefined): SecurityServices {
  const guardOptions: ContentGuardOptions = { blocked: config?.blockedTerms }
  return {
    redact: config?.redactPII ? (text) => redactPII(text).text : (text) => text,
    guard: createContentGuard(guardOptions),
    rateLimiter: config?.rateLimit ? createRateLimiter(config.rateLimit) : undefined,
    secrets: createEnvSecrets(),
  }
}

/**
 * Instantiate the enterprise services from config and register any configured
 * skills into the shared tool registry (so the system's default agent can use
 * them). Skills whose name collides with an existing tool are skipped.
 */
export function createEnterpriseServices(
  config: EnterpriseConfig,
  toolRegistry: ToolRegistry,
  logger?: Logger,
): EnterpriseServices {
  const skills = createSkillRegistry(config.skills ?? [])
  for (const skill of skills.toTools() as AnyTool[]) {
    if (toolRegistry.has(skill.name)) {
      logger?.warn("Skill name collides with an existing tool; not registered", {
        skill: skill.name,
      })
      continue
    }
    toolRegistry.register(skill)
  }

  return {
    governance: buildGovernance(config.governance),
    security: buildSecurity(config.security),
    observability: {
      metrics: createMetrics(),
      audit: createAuditLog(),
      tracing: config.observability?.tracing ?? false,
    },
    ontology: {
      entities: createEntityRegistry(config.ontology?.entities ?? []),
      store: createInMemoryOntologyStore(),
    },
    skills,
    workflows: config.workflows ?? {},
  }
}
