import type { PolicyRequest } from "./policy"

export interface PendingApproval {
  readonly id: string
  readonly request: PolicyRequest
}

/**
 * A human-in-the-loop approval gate. `request` suspends (returns a pending promise)
 * until someone calls `resolve` with the verdict — pairs with workflow checkpoints
 * to hold a run open while a human decides.
 */
export interface ApprovalGate {
  request(id: string, request: PolicyRequest): Promise<boolean>
  resolve(id: string, approved: boolean): void
  pending(): PendingApproval[]
}

export function createApprovalGate(): ApprovalGate {
  const waiters = new Map<
    string,
    { resolve: (approved: boolean) => void; request: PolicyRequest }
  >()

  return {
    request: (id, request) =>
      new Promise<boolean>((resolve) => {
        waiters.set(id, { resolve, request })
      }),
    resolve: (id, approved) => {
      const waiter = waiters.get(id)
      if (waiter) {
        waiters.delete(id)
        waiter.resolve(approved)
      }
    },
    pending: () => [...waiters.entries()].map(([id, w]) => ({ id, request: w.request })),
  }
}
