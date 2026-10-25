/**
 * Exact type-identity assertions for `type-tests/`. Load this file from a type-test tsconfig
 * (`"include"`), and the globals below are available without an import.
 *
 * `identical<Expected>()(value)` compiles only when the type of `value` is *identical* to
 * `Expected`. Plain assignment is looser: `string` accepts `"a"`, and `{a: 1, b: 2}` accepts
 * `{a: number}`. Use `identical` where the exact type is the contract.
 *
 * Only a value whose type is exactly `Expected` compiles, so a widened or narrowed type is a
 * build failure, not a silent pass.
 */
type Equal<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false

declare global {
  function identical<Expected>(): <Actual>(
    value: Actual & (Equal<Expected, Actual> extends true ? unknown : never),
  ) => void
}

export {}
