/**
 * A pluggable secrets source. The env/in-memory implementations ship here; back it
 * with Vault/AWS Secrets Manager/etc. by implementing this one method.
 */
export interface SecretsProvider {
  get(name: string): Promise<string | undefined>
}

/** Read secrets from `process.env`. */
export function createEnvSecrets(
  env: Record<string, string | undefined> = process.env,
): SecretsProvider {
  return { get: (name) => Promise.resolve(env[name]) }
}

/** An in-memory secrets source (tests, or composing with a real provider). */
export function createMemorySecrets(secrets: Record<string, string>): SecretsProvider {
  return { get: (name) => Promise.resolve(secrets[name]) }
}
