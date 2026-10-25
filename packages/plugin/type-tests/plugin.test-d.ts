import { expectType } from "tsd"

import {
  createPluginHooks,
  createPluginHost,
  type PluginHooks,
  type PluginHost,
} from "../src/index"

const host = createPluginHost()
expectType<PluginHost>(host)
expectType<Promise<void>>(host.emit("custom:event", { ok: true }))
expectType<PluginHooks>(host.getHooks())

// The hook registry is a plain object of registration and emit functions.
expectType<PluginHooks>(createPluginHooks())
