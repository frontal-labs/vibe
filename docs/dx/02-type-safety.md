# Type Safety

Vibe's first non-negotiable is that **type safety is not optional**: if the
compiler can catch it, the compiler catches it. This page is the concrete story —
the four mechanisms Vibe uses, and before/after examples of what each one turns
from a runtime surprise into a red squiggle.

The mechanisms:

1. `Brand<Base, BrandName>` — nominal typing over structural types.
2. `ServiceToken<T>` — tokens that carry their value type through DI.
3. Single-Zod-schema tool inference — one schema, typed handler *and* JSON Schema.
4. Typed errors + dedicated `type-tests/` per package.

## 1. Nominal typing with `Brand<T, B>`

TypeScript is structural: two types with the same shape are interchangeable. That
is usually convenient and occasionally catastrophic — an `ExecutionId` and a
`TraceId` are both `string`, so nothing stops you passing one where the other is
required. Vibe closes this with a single tiny primitive in `vibe/shared`:

```ts
export type Brand<Base, BrandName extends string> = Base & {
  readonly __brand: BrandName
}
```

The `__brand` field exists only in the type system (there is no runtime cost — a
branded value *is* the base value at runtime). Two brands over the same base are now
incompatible:

```ts
type ExecutionId = Brand<string, "ExecutionId">
type TraceId     = Brand<string, "TraceId">

declare function cancel(id: ExecutionId): void
const trace = "abc" as TraceId
```

**Before (plain `string`):** `cancel(trace)` compiles. The mix-up ships and blows
up at runtime, probably in production, probably at 3am.

**After (`Brand`):**

```ts
cancel(trace)
//     ~~~~~ Argument of type 'TraceId' is not assignable to parameter of type 'ExecutionId'.
//           Types of property '__brand' are incompatible.
```

The compiler catches it. You cannot fabricate a brand by accident; you get one from
the function that mints it (`createToken`, an id generator), which is exactly the
control point you want.

## 2. `ServiceToken<T>` carries the value type

DI containers keyed by strings lose type information the moment you resolve:
`container.get("logger")` is `any` or `unknown`, and you cast. Vibe's token is a
brand that *also* carries a phantom value type:

```ts
export type ServiceToken<T> = Brand<string, `ServiceToken`> & {
  readonly __type: T
}

export function createToken<T>(name: string): ServiceToken<T> {
  return `${name}__${counter}` as ServiceToken<T>
}
```

The container reads `T` back out of the token on every operation:

```ts
register<T>(token: ServiceToken<T>, factory: Factory<T>, scope?: ServiceScope): void
resolve<T>(token: ServiceToken<T>): T
```

**Before (string key):**

```ts
const logger = container.get("logger") as Logger // manual cast — nothing checks it
logger.debg("typo survives") // and it's `any`, so this typos silently
```

**After (`ServiceToken<Logger>`):**

```ts
const loggerToken = createToken<Logger>("system.logger")
const logger = container.resolve(loggerToken) // inferred Logger — no cast
logger.debg("…")
//     ~~~~ Property 'debg' does not exist on type 'Logger'. Did you mean 'debug'?
```

Registration is checked against the token too — `registerInstance(loggerToken,
runtime)` fails to compile because a `Runtime` is not a `Logger`. The token is a
type-safe handle for a value you resolve later, which is precisely what lets the
[public surface stay small while internals stay swappable](./01-api-design.md#a-small-public-surface-over-swappable-internals).

## 3. One Zod schema → typed handler *and* JSON Schema

The highest-leverage inference in Vibe is in tools 🚧. A tool is defined once with a
Zod schema, and that single schema drives two consumers:

- `z.infer<typeof schema>` gives the `execute` handler its **argument types**.
- A Zod→JSON-Schema conversion produces the **model-facing JSON Schema** the
  provider sends to the model.

```ts
import { defineTool } from "vibe/tools" // 🚧
import { z } from "zod"

const transfer = defineTool({
  name: "transfer_funds",
  description: "Move money between two accounts.",
  schema: z.object({
    fromAccount: z.string(),
    toAccount: z.string(),
    amountCents: z.number().int().positive(),
  }),
  async execute(args, ctx) {
    // args: { fromAccount: string; toAccount: string; amountCents: number }
    // fully inferred from `schema` — no separate interface to maintain
    return await bank.transfer(args.fromAccount, args.toAccount, args.amountCents)
  },
})
```

**Before (hand-written types + hand-written schema):** you maintain an
`interface TransferArgs`, a JSON Schema object, and a runtime validator — three
declarations of the same shape. Add a field to one, forget the others, and the
model sends data your handler never validated, or your validator rejects data your
types said was fine.

**After (one Zod schema):** there is exactly one source of truth. Rename
`amountCents` and:

- the handler body stops compiling until you update every use,
- the JSON Schema the model sees updates automatically,
- the runtime validation follows the schema for free.

```ts
async execute(args) {
  return bank.transfer(args.from, args.to, args.amountCents)
  //                        ~~~~ Property 'from' does not exist on type
  //                             '{ fromAccount: string; toAccount: string; amountCents: number }'.
}
```

Drift between "what the model can send," "what the handler expects," and "what gets
validated" is structurally impossible. See the [Tool spec](../specs/tool-spec.md)
for the full contract.

## 4. Typed errors

Errors are values, and their type is meaningful. Every failure is a `VibeError`
subclass with a machine-readable `ErrorCode`, so `catch` blocks branch on a type
rather than a substring:

```ts
import { ProviderRateLimitError, TimeoutError, VibeError } from "vibe/errors"
```

**Before (stringly-typed):**

```ts
catch (err) {
  if (err.message.includes("rate limit")) retry() // breaks when the wording changes
  if (err.message.includes("timed out")) giveUp()  // and it's `any`
}
```

**After (typed):**

```ts
catch (err) {
  if (err instanceof ProviderRateLimitError) retry()      // narrowed, code-backed
  else if (err instanceof TimeoutError)      giveUp()
  else if (err instanceof VibeError)         report(err.code, err.serialize())
  else throw err
}
```

The narrowing is real: inside the first branch `err` is a `ProviderRateLimitError`
with its typed fields. The same codes flow from the
[model spec's HTTP mapping](../specs/model-spec.md#errors-http--vibeerrors) and the
[agent loop's error table](../architecture/09-agent-loop.md#error-taxonomy-in-the-loop),
so retry policy, telemetry, and user messaging all read the same value.

## Dedicated `type-tests/` per package

Runtime tests prove behaviour; **type tests prove the *types* behave.** Every Vibe
package ships type-tests alongside its Vitest unit tests, using `tsd`-style
assertions (`expectAssignable`, `expectType`, `expectError`). These fail the build
if an inference regresses — a return type widens to `any`, a brand stops being
nominal, a handler's args stop matching its schema.

```ts
// packages/tools/type-tests/define-tool.test-d.ts  🚧
import { expectAssignable, expectError } from "tsd"
import { defineTool } from "vibe/tools"
import { z } from "zod"

const t = defineTool({
  name: "echo",
  description: "Echo a message.",
  schema: z.object({ message: z.string() }),
  async execute(args) {
    expectAssignable<{ message: string }>(args) // args inferred from schema ✓
    return args.message
  },
})

// A handler that reads a field not in the schema must NOT type-check:
expectError(
  defineTool({
    name: "bad",
    description: "…",
    schema: z.object({ message: z.string() }),
    async execute(args) {
      return args.missing // ← expectError asserts this is a compile error
    },
  }),
)
```

Existing packages already carry these — e.g. `vibe/shared` migrated its assertions
to `expectAssignable`. Type tests are part of `bun ci:check`, so a change that
silently weakens a type is a **red build**, not a latent bug. See the
[testing strategy](../plan/03-testing-strategy.md).

## The net effect

| Class of mistake | Without Vibe | With Vibe |
|---|---|---|
| Passing the wrong id/string | Runtime bug | `Brand` — compile error |
| Resolving a service to the wrong type | Cast + `any` | `ServiceToken<T>` — inferred, checked |
| Tool schema ↔ handler drift | Three-way desync | One Zod schema — single source of truth |
| Error handling on message text | Brittle string match | `instanceof VibeError` + `ErrorCode` |
| A regression that widens a type | Ships silently | `type-tests/` — red build |

The goal is not "TypeScript for its own sake." It is that the categories of bug
that plague hand-rolled agent glue — id mix-ups, untyped service lookups,
schema/handler drift, stringly-typed error handling — are ones the compiler can
eliminate, so Vibe makes it eliminate them.

## Where to go next

- [API design](./01-api-design.md) — the conventions these types live inside.
- [Tool spec](../specs/tool-spec.md) — the single-schema rule, in full.
- [Quickstart](./03-quickstart.md) — see the inference work in a real tool.
