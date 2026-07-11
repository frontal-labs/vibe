# TypeScript Interop

> 🚧 Planned. `.vibe` and `.ts` are not two worlds bridged by glue — they are one
> program with one type system. Everything inside a `tool` body, every type, and
> every `import` is ordinary TypeScript, checked by the real TypeScript Compiler API.
> This is the [overview's](./00-overview.md) "superset in spirit" claim, made
> concrete: like `.svelte`/`.vue` embed TS, or like TS itself is a superset of JS.

Vibe adds *declarations* — `agent`, `tool`, `model`, `memory`, `plugin`, `config` —
on top of TypeScript. It does **not** add expressions, statements, or a type
language. Inside a tool body you write TypeScript; a parameter type *is* a TypeScript
type; an `import` *is* a TypeScript import. The [compiler](./02-compiler.md) hands all
of those spans to `tsc` (the [Check phase](./02-compiler.md#4-check)) and maps errors
back to `.vibe` positions. There is exactly **one** type system, and it is
TypeScript's.

---

## Importing TypeScript *into* `.vibe`

An `import` at the top of a `.vibe` file is a normal TypeScript import. What it brings
into scope is usable everywhere Vibe embeds TypeScript:

```vibe
import { db } from "./db"
import type { OrderStatus } from "./types"
import { company, today } from "./context"

/// Look up the current status of a customer order by id.
tool GetOrder(orderId: string) -> OrderStatus {
  const order = await db.orders.find(orderId)   // `db` used in a tool body
  return order ?? { status: "not_found" }
}

agent Support {
  model claude-opus-4-8
  system """
    You are a support agent for ${company.name}.       // used in ${} interpolation
    Today is ${today()}. Use tools before guessing.
  """
}

plugin Metrics {
  on stop { await db.metrics.flush() }              // used in a plugin body
}
```

The imported symbols are available in the three places Vibe holds TypeScript spans:

- **Tool bodies** — `db` above.
- **Prompt `${}` interpolation** — `company.name`, `today()` above.
- **Plugin `on` bodies** — `db.metrics.flush()` above.

Types flow in the same way: `OrderStatus` from `./types` is the tool's return type,
and the checker verifies the body actually returns that shape. Your existing code and
types are the source of truth; Vibe just uses them.

---

## Tool bodies and types *are* TypeScript

A tool's parameter types, return type, and body are not a Vibe dialect — they are
TypeScript, checked by the **TypeScript Compiler API** against your project's
`tsconfig.json`. The compiler synthesizes a virtual TS program: it wraps each body in
a typed function signature derived from the declared params and return, lets `tsc`
report errors, and re-anchors them to `.vibe:line:col` (see
[Check](./02-compiler.md#4-check) and [Diagnostics](./02-compiler.md#diagnostics)).

```vibe
tool GetOrder(orderId: string) -> OrderStatus {
  const order = await db.orders.find(orderId)
  return order.total          // TS2532 if `order` may be undefined — real tsc error,
}                             // reported at this line in the .vibe file
```

One type system, one source of truth. A type error in a tool body is the same error,
from the same checker, that `tsc` would give you in a `.ts` file — there is no second
notion of "correct" to fall out of sync with.

---

## Importing `.vibe` *from* TypeScript

The compiler emits a declaration file per input — **`<name>.vibe.d.ts`** (see
[Emit](./02-compiler.md#5-emit)) — so a `.ts` file can import what a `.vibe` file
`export`s, fully typed:

```ts
// server.ts
import { GetOrder, Support } from "./support.vibe"

const status = await GetOrder.execute({ orderId: "1024" }, ctx) // typed input & output
const { text } = await Support.run({ text: "Where is order 1024?" })
```

For the `support.vibe` above (with `export tool GetOrder` and `export agent
Support`), the emitted declarations look like:

```ts
// .vibe/support.vibe.d.ts  (generated)
import type { Tool, Agent } from "@vibe/tools"
import type { OrderStatus } from "../types"

export declare const GetOrder: Tool<{ orderId: string }, OrderStatus>
export declare const Support: Agent
```

The tool surfaces as `Tool<In, Out>` — the exact interface from the
[tool spec](../specs/tool-spec.md), with `In` derived from the declared parameters and
`Out` from the return type — and the agent as `Agent`. Consumers get full completion
and type checking on `.execute(...)` / `.run(...)`, and go-to-definition through the
`.d.ts` lands back in the `.vibe` source.

---

## Type → schema lowering

A tool is declared **once**; its parameter types drive both the handler's static
types *and* the model-facing JSON Schema. The compiler lowers the parameter types to
a Zod schema (which is then rendered to JSON Schema for the model) — the same mapping
the [tool spec](../specs/tool-spec.md#the-single-zod-schema-inference-rule) and the
[compiler codegen](./02-compiler.md#codegen-what-each-construct-emits) describe:

| Vibe type | Lowered schema |
|---|---|
| `string` | `z.string()` |
| `number` | `z.number()` |
| `boolean` | `z.boolean()` |
| `T[]` / `Array<T>` | `z.array(<T>)` |
| `{ a: A; b: B }` | `z.object({ a: <A>, b: <B> })` |
| `A \| B` | `z.union([<A>, <B>])` |
| `"a" \| "b"` (string literal union) | `z.enum(["a", "b"])` |
| `T?` / `T \| undefined` | `.optional()` |
| `@desc("…")` on a param | `.describe("…")` |

```vibe
tool CreateTicket(
  title: string @desc("Short summary of the issue."),
  priority: "low" | "medium" | "high",
  tags?: string[]
) -> Ticket { … }
```

lowers to, roughly:

```ts
z.object({
  title:    z.string().describe("Short summary of the issue."),
  priority: z.enum(["low", "medium", "high"]),
  tags:     z.array(z.string()).optional(),
})
```

### What is rejected at Check

Only types expressible as a tool JSON Schema are allowed as parameters. Shapes with no
JSON-Schema form are **rejected at Check with a clear message**, not silently dropped
(consistent with the [tool spec](../specs/tool-spec.md) and the
[well-formedness rules](../specs/grammar.md#well-formedness-checked-not-grammatical)):

- Functions / callables as parameters.
- `unknown` / `any` / non-serializable types (`Date`, `Map`, class instances, `bigint`
  where unsupported) in the input position.
- Symbols, `Promise<T>` inputs, and other runtime-only shapes.

```
support.vibe:12:22  error  VB2200  Tool parameter 'onDone' has type '() => void',
                                   which cannot be expressed as a tool JSON Schema.
```

Return types are typed by TypeScript and serialized to the model as content; the
strict JSON-Schema constraint applies to **inputs**, which the model must produce.

---

## Build & module resolution

- **tsconfig integration.** The compiler type-checks embedded spans against your
  `tsconfig.json` — the same `compilerOptions`, `paths`, and `lib` your `.ts` uses.
  There is no separate Vibe type configuration to keep in step.
- **Module resolution for `.vibe` specifiers.** Importing `"./support.vibe"` from
  `.ts` resolves through the emitted `.vibe.d.ts` (types) and `.vibe.ts`/`.js`
  (runtime). During `vibe build`, `.vibe` specifiers resolve to the compiled JS in
  `dist/`; during `vibe dev`, to the generated files in `.vibe/`.
- **Source maps.** Each emitted line maps back to its `.vibe` origin (see
  [source maps & debugging](./02-compiler.md#source-maps--debugging)), so runtime
  stack traces, debugger breakpoints, and error `.stack` values land on the offending
  `return`/`await` in your `.vibe` body — not in generated code you never wrote.

---

## Gradual adoption

Interop is bidirectional and incremental, so there is no all-or-nothing switch:

- **A mostly-TypeScript project can add one `.vibe` file.** Drop `support.vibe` next
  to your `.ts`, `import { Support } from "./support.vibe"`, and everything else stays
  TypeScript. The compiler runs as one build step in front of `tsc` (see
  [Toolchain](./03-toolchain.md#how-this-maps-to-the-existing-tooling)); nothing else
  changes.
- **A `.vibe`-first project is mostly TypeScript inside the bodies.** The declarations
  are Vibe; the logic — every tool body, every imported module, every interpolated
  expression — is TypeScript. You are always writing TypeScript; Vibe just removes the
  wiring boilerplate around it.

This is the **superset in spirit** framing from the [overview](./00-overview.md):
Vibe does not replace TypeScript, and it does not fork it. It adds agent, tool, and
model *declarations* on top of a language that stays entirely TypeScript underneath —
the same way TypeScript added types on top of a language that stayed JavaScript.

## Where to go next

- [Syntax](./01-syntax.md) — the constructs whose bodies and types are TypeScript.
- [The compiler](./02-compiler.md) — how embedded spans are checked and emitted.
- [Toolchain](./03-toolchain.md) — where the `.vibe → .ts` step sits in the build.
- [Tool spec](../specs/tool-spec.md) — the `Tool<In, Out>` contract and schema rule.
