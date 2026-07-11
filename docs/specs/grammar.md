# Vibe Grammar

> 🚧 Planned. A reference grammar for `.vibe`, in EBNF-ish notation. `TS<…>` denotes
> a span handed to the TypeScript compiler (types, expressions, statement blocks) —
> Vibe does not re-specify TypeScript. Prose rules are in [Syntax](../language/01-syntax.md);
> the checker is in [The compiler](../language/02-compiler.md).

## Notation
- `A?` optional · `A*` zero-or-more · `A+` one-or-more · `A | B` choice ·
  `( … )` grouping · `"lit"` terminal · `TS<X>` a TypeScript span of kind `X`.
- Whitespace and comments (`// … `, `/* … */`) are insignificant except where noted.
  A `/// doc` comment attaches to the next declaration.

## Top level

```ebnf
File          = Item* ;
Item          = ImportDecl
              | ConfigDecl
              | ModelDecl
              | MemoryDecl
              | ToolDecl
              | AgentDecl
              | PluginDecl ;

Export        = "export" ;                     (* prefix allowed on Tool/Agent/Model *)
```

## Imports (TypeScript interop)

```ebnf
ImportDecl    = "import" TS<ImportClause> "from" StringLit ;
```
`ImportClause` is any valid TS import (`{ a, b }`, `type { T }`, `* as ns`, default).

## Config

```ebnf
ConfigDecl    = "config" "{" ConfigField* "}" ;
ConfigField   = Ident ConfigValue
              | "runtime" "{" RuntimeField* "}"
              | "provider" Ident ;
ConfigValue   = StringLit | Number | Bool | Ident ;
RuntimeField  = "limits" "{" ( Ident ":" Number ";"? )* "}"
              | "retry"  "{" ( Ident ":" (Number|Bool) ";"? )* "}"
              | Ident ConfigValue ;
```

## Model

```ebnf
ModelDecl     = Export? "model" Ident "{" ModelField* "}" ;
ModelField    = "id"     ModelId
              | "effort" Effort
              | Ident    ConfigValue ;
ModelId       = Ident ;                          (* validated against the catalog *)
Effort        = "low" | "medium" | "high" | "xhigh" | "max" ;
```

## Memory

```ebnf
MemoryDecl    = "memory" Ident "{" MemoryField* "}" ;
MemoryField   = "kind"   ("conversation" | "store")
              | "budget" Number
              | Ident    ConfigValue ;
```

## Tool

```ebnf
ToolDecl      = DocComment? Export? "tool" Ident "(" ParamList? ")" ReturnType? Ctx? Block ;
ParamList     = Param ( "," Param )* ","? ;
Param         = Ident ":" TS<Type> Desc? ;
Desc          = "@desc" "(" StringLit ")" ;
ReturnType    = "->" TS<Type> ;
Ctx           = "with" Ident ;                   (* names the ToolContext binding *)
Block         = "{" TS<StatementList> "}" ;       (* async TypeScript body *)
DocComment    = "///" text NL ;                   (* becomes the tool description *)
```

## Agent

```ebnf
AgentDecl     = DocComment? Export? "agent" Ident "{" AgentMember* "}" ;
AgentMember   = "model"         (Ident | ModelId)
              | "effort"        Effort
              | "system"        Prompt
              | "memory"        (Ident | "conversation")
              | "maxIterations" Number
              | UseStmt
              | Ident ConfigValue ;              (* forward-compatible fields *)
UseStmt       = "use" Ident ;                     (* tool | agent (sub-agent) | plugin *)
```

## Plugin

```ebnf
PluginDecl    = Export? "plugin" Ident "{" PluginMember* "}" ;
PluginMember  = "on" HookName Block
              | Ident ConfigValue ;
HookName      = "start" | "stop" | "init"
              | AgentHook ;
AgentHook     = "agent:" Ident ;                  (* e.g. agent:beforeModelCall *)
```

## Prompts, strings, literals

```ebnf
Prompt        = StringLit | TripleString ;
TripleString  = '"""' ( Char | Interp )* '"""' ;
Interp        = "${" TS<Expression> "}" ;
StringLit     = '"' ( Char | Interp )* '"' ;
Number        = TS<NumericLiteral> ;              (* incl. 120_000 *)
Bool          = "true" | "false" ;
Ident         = TS<Identifier> ;
```

## Contextual keywords

`agent`, `tool`, `model`, `memory`, `plugin`, `config`, `use`, `on`, `with`,
`import`, `export`, `effort`, `system`, `id`, `kind`, `budget`, `provider`,
`runtime`, `limits`, `retry`, `maxIterations` are **contextual** — recognized as
keywords only at the positions above, so they remain usable as identifiers inside
`TS<…>` spans (your TypeScript can have a variable named `agent`).

## Well-formedness (checked, not grammatical)

Enforced by the [checker](../language/02-compiler.md#4-check), not the parser:

- `use X` resolves to an in-scope `tool` / `agent` / `plugin`.
- `model <id>` resolves to the [catalog](./model-spec.md); unknown → error.
- At most one `config` per compilation.
- Tool parameter/return types must be lowerable to a tool JSON Schema.
- No agent-`use` cycles beyond the permitted delegation depth.
- Embedded `TS<…>` spans must type-check under the project's TypeScript program.

## Example parse targets

Each of these is a single `Item`:

```vibe
export tool GetOrder(orderId: string @desc("Order id")) -> OrderStatus { /* TS */ }

agent Support { model claude-opus-4-8 ; effort high ; system "…" ; use GetOrder }

model Fast { id claude-haiku-4-5 ; effort low }

config { name "support-bot" ; logLevel info ; provider anthropic }
```
