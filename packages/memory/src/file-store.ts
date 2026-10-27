import { createHash, randomBytes } from "node:crypto"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { runtimeError } from "vibe/errors"
import type { Message } from "vibe/model"

import type { CheckpointStore, Memory, RunCheckpoint } from "./types"

export interface FileStoreOptions {
  /** Directory that holds one JSON file per key. Created on first write. */
  dir: string
}

/**
 * Keys become file names, so they are reduced to a safe, readable prefix plus a hash. The hash keeps
 * distinct keys distinct even when their prefixes collide.
 */
function fileName(dir: string, key: string): string {
  const readable = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64)
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16)
  return join(dir, `${readable}-${hash}.json`)
}

/**
 * Conversations and checkpoints hold user data, and checkpoints hold tool inputs and outputs, so
 * the directory and files are owner-only (0700 / 0600). The temp file is created with `wx`, which
 * refuses to follow a path that already exists, so a file planted in advance cannot be written
 * through. Writes go to that temp file and are renamed over the target, so a crash never leaves a
 * half-written file.
 */
const DIR_MODE = 0o700
const FILE_MODE = 0o600

async function writeAtomic(path: string, data: string, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: DIR_MODE })
  // Tighten a directory that already existed with looser permissions.
  await chmod(dir, DIR_MODE)
  const temp = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`
  await writeFile(temp, data, { encoding: "utf8", mode: FILE_MODE, flag: "wx" })
  await rename(temp, path)
}

async function readJson<T>(path: string): Promise<T | undefined> {
  let raw: string
  try {
    raw = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw runtimeError(`Corrupt store file ${path}`, error instanceof Error ? error : undefined)
  }
}

/**
 * Serializes operations per key within this process. Two concurrent `append`s to the same
 * conversation would otherwise read the same snapshot and lose one message.
 */
function keyedQueue() {
  const tails = new Map<string, Promise<unknown>>()
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = tails.get(key) ?? Promise.resolve()
    const next = previous.then(task, task)
    tails.set(
      key,
      next.catch(() => undefined),
    )
    return next
  }
}

/**
 * A durable `CheckpointStore` backed by one JSON file per run. Survives process restarts, so a run
 * interrupted by a crash can resume from its last completed iteration. Node and Bun only.
 */
export function createFileCheckpointStore(options: FileStoreOptions): CheckpointStore {
  const queue = keyedQueue()
  return {
    load: (runId) => readJson<RunCheckpoint>(fileName(options.dir, runId)),
    save: (runId, checkpoint) =>
      queue(runId, () =>
        writeAtomic(fileName(options.dir, runId), JSON.stringify(checkpoint), options.dir),
      ),
    clear: (runId) => queue(runId, () => rm(fileName(options.dir, runId), { force: true })),
  }
}

/**
 * A durable conversation `Memory` backed by one JSON file per conversation id. Conversations persist
 * across runs and process restarts. Node and Bun only; for multiple processes writing the same
 * directory, use a database-backed `Memory` instead, since per-key queues only serialize one process.
 */
export function createFileMemory(options: FileStoreOptions): Memory {
  const queue = keyedQueue()
  const pathFor = (id: string) => fileName(options.dir, id)
  return {
    async load(id) {
      return (await readJson<Message[]>(pathFor(id))) ?? []
    },
    save(id, messages) {
      return queue(id, () => writeAtomic(pathFor(id), JSON.stringify(messages), options.dir))
    },
    append(id, message) {
      return queue(id, async () => {
        const existing = (await readJson<Message[]>(pathFor(id))) ?? []
        existing.push(message)
        await writeAtomic(pathFor(id), JSON.stringify(existing), options.dir)
      })
    },
    clear(id) {
      return queue(id, () => rm(pathFor(id), { force: true }))
    },
  }
}
