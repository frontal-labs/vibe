# Your first agent

```ts
import { vibe } from "frontal-vibe/core"
import { createAnthropicProvider } from "frontal-vibe/model"

const system = vibe.system({
  name: "hello",
  provider: createAnthropicProvider(), // reads ANTHROPIC_API_KEY
})
await system.start()
console.log(await system.ask("Say hello."))
await system.stop()
```

For offline/tests, swap the provider for `createFakeProvider([...])`.
Runnable: [`examples/hello-agent`](../examples/hello-agent).
