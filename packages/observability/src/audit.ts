/** One immutable audit record of a governed action. */
export interface AuditEntry {
  readonly timestamp: string
  readonly action: string
  readonly actor?: string
  readonly correlationId?: string
  readonly detail?: Readonly<Record<string, unknown>>
}

/** Where audit entries are shipped (a compliance sink, SIEM, append-only log). */
export interface AuditSink {
  write(entry: AuditEntry): void
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, "timestamp"> & { timestamp?: string }): AuditEntry
  entries(): readonly AuditEntry[]
}

/** A console audit sink (JSON per line). */
export function createConsoleAuditSink(): AuditSink {
  return {
    write: (entry) => {
      // biome-ignore lint/suspicious/noConsole: audit sink writes to the log stream by design
      console.info(JSON.stringify({ audit: entry }))
    },
  }
}

/**
 * An append-only audit log. Every governed decision, tool call, and result should
 * flow through here with a correlation id, giving an immutable trail for
 * compliance. Entries are also mirrored to an optional external sink.
 */
export function createAuditLog(
  sink?: AuditSink,
  clock: () => string = () => new Date().toISOString(),
): AuditLog {
  const log: AuditEntry[] = []
  return {
    record: (entry) => {
      const full: AuditEntry = { ...entry, timestamp: entry.timestamp ?? clock() }
      log.push(full)
      sink?.write(full)
      return full
    },
    entries: () => [...log],
  }
}
