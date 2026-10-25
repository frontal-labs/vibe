import { expectType } from "tsd"

import {
  createLifecycle,
  LIFECYCLE_STATES,
  type Lifecycle,
  type LifecycleEvent,
  type LifecycleState,
} from "../src/index"

const lifecycle = createLifecycle()
expectType<Lifecycle>(lifecycle)
expectType<LifecycleState>(lifecycle.state)
expectType<Promise<void>>(lifecycle.init())
expectType<Promise<void>>(lifecycle.start())
expectType<Promise<void>>(lifecycle.stop())

// The lifecycle states are a closed set.
expectType<readonly LifecycleState[]>(LIFECYCLE_STATES)
// @ts-expect-error: unknown state
expectType<LifecycleState>("exploded")
expectType<LifecycleEvent>("init")
