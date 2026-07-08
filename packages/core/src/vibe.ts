import { createSystem } from "./system"
import type { System } from "./system"
import type { SystemConfig } from "./types"

interface Vibe {
  system(config: SystemConfig): System
}

export const vibe: Vibe = {
  system(config: SystemConfig): System {
    return createSystem(config)
  },
}
