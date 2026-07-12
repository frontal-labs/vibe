import { spawn } from "node:child_process"

export interface ExecResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ExecOptions {
  readonly cwd: string
  readonly timeoutMs?: number
}

/**
 * Run a command to completion, capturing stdout/stderr and the exit code.
 * Everything the agent loop needs to operate Vibe (build, test, lint) flows
 * through here, always scoped to the workspace root by the caller.
 */
export function exec(command: string, args: string[], options: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      timeout: options.timeoutMs,
      windowsHide: true,
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on("error", (error) => reject(error))
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 0, stdout, stderr })
    })
  })
}
