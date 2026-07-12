# The Vibe language

Write `.vibe` and compile it to TypeScript with the `vibe` CLI:

```vibe
config { name "support" ; provider anthropic }

tool GetOrder(orderId: string) -> string { return `shipped: ${orderId}` }

agent Support {
  model claude-opus-4-8
  system "You are a concise support agent."
  use GetOrder
}
```

```sh
cargo build -p vibe_napi --features node --release   # build the compiler addon once
bunx @vibe/cli build main.vibe                       # → .vibe/main.ts (+ .d.ts + map)
```

The emitted TypeScript runs on the same `@vibe/*` runtime the hand-written examples
use. Runnable: [`examples/vibe-language`](../examples/vibe-language).
